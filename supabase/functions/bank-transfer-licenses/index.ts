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
const json = (body: Record<string, unknown>, code = 200) =>
  new Response(JSON.stringify(body), { status: code, headers: cors });
const textField = (value: unknown) => typeof value === "string" ? value.trim() : "";
const validUuid = (value: unknown) => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const createDb = (url: string, key: string) => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const safeError = (error: { code?: string; message?: string } | null) => {
  const msg = error?.message || "";
  if (error?.code === "23505") return "duplicate_transaction_or_order";
  if (/BANK_AMOUNT_MISMATCH/.test(msg)) return "bank_amount_mismatch";
  if (/BANK_MISMATCH_REASON_REQUIRED/.test(msg)) return "bank_mismatch_reason_required";
  if (/ORDER_ALREADY_PROCESSED|MEMBER_ALREADY_LICENSED|NO_STATUS_CHANGE/.test(msg)) return "already_processed";
  if (/INVALID_BANK_PROOF|INVALID_STATUS_OR_REASON|REJECTION_REASON_REQUIRED/.test(msg)) return "invalid_fields";
  return "operation_failed";
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const tokenHeader = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(tokenHeader)) return json({ error: "login_required" }, 401);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid_request" }, 400);

  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const publicKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!url || !serviceKey || !publicKey) return json({ error: "server_unavailable" }, 503);
    const db = createDb(url, serviceKey);
    const token = tokenHeader.replace(/^Bearer\s+/i, "");
    const { data: authData, error: authErr } = await db.auth.getUser(token);
    const user = authData?.user;
    if (authErr || !user?.id) return json({ error: "login_required" }, 401);
    const action = body.action;

    if (action === "my-requests") {
      const { data, error } = await db.from("bank_transfer_requests")
        .select("id,order_number,product_name,church_name,depositor_name,amount_krw,deposited_on,status,review_note,created_at,reviewed_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(60);
      return error ? json({ error: "lookup_failed" }, 503) : json({ requests: data || [] });
    }

    if (action === "submit") {
      const church = textField(body.church_name);
      const depositor = textField(body.depositor_name);
      const contactName = textField(body.contact_name);
      const phone = textField(body.phone);
      const amount = body.amount_krw;
      const date = body.deposited_on;
      if (church.length < 2 || church.length > 120 || depositor.length < 2 || depositor.length > 80 ||
          contactName.length < 2 || contactName.length > 80 ||
          (phone && !/^[+0-9()\s-]{8,24}$/.test(phone)) ||
          !Number.isInteger(amount) || amount < 1 || amount > 100000000 ||
          typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !Number.isFinite(Date.parse(date))) return json({ error: "invalid_fields" }, 400);

      const { data: current, error: existingErr } = await db.from("licenses")
        .select("id").eq("user_id", user.id).eq("status", "active").limit(1);
      if (existingErr) return json({ error: "lookup_failed" }, 503);
      if (current?.length) return json({ error: "license_already_issued" }, 409);

      const { error: contactError } = await db.from("member_contacts").upsert({
        user_id: user.id, church_name: church, contact_name: contactName,
        phone: phone || null, updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (contactError) return json({ error: "profile_failed" }, 503);

      const { data, error } = await db.from("bank_transfer_requests").insert({
        user_id: user.id, church_name: church, depositor_name: depositor,
        amount_krw: amount, deposited_on: date,
      }).select("id,order_number,status,created_at").single();
      if (error) return json({ error: error.code === "23505" ? "pending_request_exists" : "submit_failed" }, error.code === "23505" ? 409 : 503);
      return json({ request: data }, 201);
    }

    // The following actions require the server to verify an administrator's DB role.
    const { data: profile, error: profileError } = await db.from("profiles")
      .select("role").eq("user_id", user.id).maybeSingle();
    if (profileError || profile?.role !== "admin") return json({ error: "forbidden" }, 403);

    if (action === "admin-list") {
      const results = await Promise.all([
        db.from("bank_transfer_requests").select(
          "id,order_number,user_id,product_code,product_name,church_name,depositor_name,amount_krw,deposited_on,status,created_at,reviewed_at,reviewed_by,license_id,review_note"
        ).order("created_at", { ascending: false }).limit(500),
        db.from("member_contacts").select("user_id,church_name,contact_name,phone,updated_at").limit(1000),
        db.from("profiles").select("user_id,display_name,role,created_at").limit(1000),
        db.from("licenses").select("id,user_id,license_key,status,issued_at,max_devices,expires_at,created_at").order("issued_at", { ascending: false }).limit(1000),
        db.from("license_devices").select("license_id,user_id,device_name,platform,app_version,is_active,registered_at,last_seen_at,released_at").limit(2000),
        db.from("bank_deposit_evidence").select("request_id,bank_name,transaction_reference,bank_depositor_name,bank_amount_krw,bank_deposited_at,verification_note,confirmed_by,confirmed_at").limit(500),
        db.from("commerce_audit_events").select("id,request_id,user_id,license_id,actor_user_id,event_type,detail,occurred_at").order("occurred_at", { ascending: false }).limit(500),
      ]);
      if (results.some(r => r.error)) return json({ error: "lookup_failed" }, 503);
      const users: Array<Record<string,unknown>> = [];
      for (let page = 1; page <= 10; page++) {
        const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
        if (error) return json({ error: "lookup_failed" }, 503);
        const next = data?.users || [];
        users.push(...next.map(u => ({ id: u.id, email: u.email || "", created_at: u.created_at, last_sign_in_at: u.last_sign_in_at })));
        if (next.length < 200) break;
      }
      const licenses = (results[3].data || []).map(l => {
        const { license_key: key, ...rest } = l;
        return { ...rest, masked_key: key ? "••••-••••-" + key.slice(-6) : "" };
      });
      return json({
        requests: results[0].data || [], members: users,
        contacts: results[1].data || [], profiles: results[2].data || [],
        licenses, devices: results[4].data || [], evidence: results[5].data || [],
        audit: results[6].data || [], scope: "first_500_orders_last_500_events_2000_members",
      });
    }

    if (action === "admin-license-key") {
      const id = body.license_id;
      const password = typeof body.password === "string" ? body.password : "";
      if (!Number.isSafeInteger(id) || id < 1 || !password || password.length > 200 || !user.email) {
        return json({ error: "invalid_fields" }, 400);
      }
      const checker = createDb(url, publicKey);
      const { data: verified, error: passwordError } = await checker.auth.signInWithPassword({
        email: user.email, password,
      });
      if (passwordError || verified.user?.id !== user.id) return json({ error: "invalid_password" }, 403);
      const { data: license, error } = await db.from("licenses").select("license_key")
        .eq("id", id).maybeSingle();
      if (error || !license) return json({ error: "not_found" }, 404);
      return json({ license_key: license.license_key });
    }

    if (!validUuid(body.id) && ["approve","reject"].includes(action)) return json({ error: "invalid_request_id" }, 400);

    if (action === "approve") {
      if (body.bank_statement_checked !== true) return json({ error: "bank_statement_confirmation_required" }, 400);
      const amount = body.bank_amount_krw;
      const timestamp = textField(body.bank_deposited_at);
      if (!Number.isInteger(amount) || amount <= 0 || !timestamp || !Number.isFinite(Date.parse(timestamp))) {
        return json({ error: "invalid_fields" }, 400);
      }
      const { data, error } = await db.rpc("approve_bank_transfer_with_evidence", {
        p_request_id: body.id,
        p_admin_id: user.id,
        p_bank_name: textField(body.bank_name),
        p_transaction_reference: textField(body.transaction_reference),
        p_bank_depositor_name: textField(body.bank_depositor_name),
        p_bank_amount_krw: amount,
        p_bank_deposited_at: timestamp,
        p_verification_note: textField(body.verification_note) || null,
      });
      if (error) return json({ error: safeError(error) }, safeError(error) === "already_processed" || safeError(error) === "duplicate_transaction_or_order" ? 409 : 400);
      return json({ approved: true, license_id: data });
    }

    if (action === "reject") {
      const reason = textField(body.reason);
      if (reason.length < 5 || reason.length > 500) return json({ error: "invalid_fields" }, 400);
      const { error } = await db.rpc("reject_bank_transfer_with_reason", {
        p_request_id: body.id, p_admin_id: user.id, p_reason: reason,
      });
      if (error) return json({ error: safeError(error) }, 409);
      return json({ rejected: true });
    }

    if (action === "set-license-status") {
      const licenseId = body.license_id;
      const newStatus = body.new_status;
      const reason = textField(body.reason);
      if (!Number.isSafeInteger(licenseId) || licenseId < 1 ||
          !["blocked","active"].includes(newStatus) || reason.length < 5 || reason.length > 500) {
        return json({ error: "invalid_fields" }, 400);
      }
      const { error } = await db.rpc("set_member_license_status", {
        p_license_id: licenseId, p_admin_id: user.id, p_new_status: newStatus, p_reason: reason,
      });
      if (error) return json({ error: safeError(error) }, 409);
      return json({ updated: true });
    }
    return json({ error: "unknown_action" }, 400);
  } catch {
    return json({ error: "server_unavailable" }, 503);
  }
});