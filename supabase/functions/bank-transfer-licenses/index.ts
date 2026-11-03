import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "Pragma": "no-cache",
};
const answer = (data: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: cors });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return answer({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authHeader)) return answer({ error: "login_required" }, 401);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return answer({ error: "invalid_request" }, 400);
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return answer({ error: "server_unavailable" }, 503);
    const db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: identity, error: identityError } = await db.auth.getUser(token);
    const user = identity?.user;
    if (identityError || !user?.id) return answer({ error: "login_required" }, 401);

    const action = body.action;

    if (action === "my-requests") {
      const { data, error } = await db.from("bank_transfer_requests")
        .select("id,church_name,depositor_name,amount_krw,deposited_on,status,created_at,reviewed_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) return answer({ error: "lookup_failed" }, 503);
      return answer({ requests: data || [] });
    }

    if (action === "submit") {
      const church = typeof body.church_name === "string" ? body.church_name.trim() : "";
      const depositor = typeof body.depositor_name === "string" ? body.depositor_name.trim() : "";
      const amount = body.amount_krw;
      const date = body.deposited_on;
      if (church.length < 2 || church.length > 120 ||
          depositor.length < 2 || depositor.length > 80 ||
          !Number.isInteger(amount) || amount < 1 || amount > 100000000 ||
          typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !Number.isFinite(Date.parse(date))) {
        return answer({ error: "invalid_fields" }, 400);
      }

      // Existing license holders cannot order a second active permanent key.
      const existing = await db.from("licenses").select("id")
        .eq("user_id", user.id).eq("status", "active").limit(1);
      if (existing.error) return answer({ error: "lookup_failed" }, 503);
      if (existing.data && existing.data.length > 0) return answer({ error: "license_already_issued" }, 409);

      const { data, error } = await db.from("bank_transfer_requests").insert({
        user_id: user.id,
        church_name: church,
        depositor_name: depositor,
        amount_krw: amount,
        deposited_on: date,
      }).select("id,status,created_at").single();
      if (error) {
        if (error.code === "23505") return answer({ error: "pending_request_exists" }, 409);
        return answer({ error: "submit_failed" }, 503);
      }
      return answer({ request: data }, 201);
    }

    if (action === "admin-list" || action === "approve" || action === "reject") {
      const { data: profile, error: profileError } = await db.from("profiles")
        .select("role").eq("user_id", user.id).maybeSingle();
      if (profileError || profile?.role !== "admin") return answer({ error: "forbidden" }, 403);

      if (action === "admin-list") {
        const { data, error } = await db.from("bank_transfer_requests")
          .select("id,user_id,church_name,depositor_name,amount_krw,deposited_on,status,created_at,reviewed_at,license_id")
          .order("created_at", { ascending: false }).limit(100);
        if (error) return answer({ error: "lookup_failed" }, 503);
        const ids = [...new Set((data || []).map((entry) => entry.user_id))];
        const emails = new Map<string, string>();
        for (const id of ids) {
          const response = await db.auth.admin.getUserById(id);
          if (!response.error) emails.set(id, response.data?.user?.email || "");
        }
        return answer({ requests: (data || []).map((entry) => ({
          ...entry, email: emails.get(entry.user_id) || "",
        })) });
      }

      const id = body.id;
      if (typeof id !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        return answer({ error: "invalid_request_id" }, 400);
      }

      if (action === "approve") {
        // No caller-submitted bank transfer claim authorizes a key. The admin must
        // explicitly confirm a matching REAL deposit outside this application.
        if (body.bank_statement_checked !== true) {
          return answer({ error: "bank_statement_confirmation_required" }, 400);
        }
        const { data, error } = await db.rpc("approve_bank_transfer_request", {
          p_request_id: id, p_admin_id: user.id,
        });
        if (error) {
          if (/ALREADY|LICENSED/i.test(error.message)) return answer({ error: "already_processed" }, 409);
          return answer({ error: "approval_failed" }, 503);
        }
        return answer({ approved: true, license_id: data });
      }

      const { data, error } = await db.from("bank_transfer_requests").update({
        status: "rejected", reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", id).eq("status", "pending").select("id").maybeSingle();
      if (error) return answer({ error: "reject_failed" }, 503);
      if (!data) return answer({ error: "already_processed" }, 409);
      return answer({ rejected: true });
    }

    return answer({ error: "unknown_action" }, 400);
  } catch {
    // Passwords, secrets, user data and raw bank claims are not logged.
    return answer({ error: "server_unavailable" }, 503);
  }
});
