import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "Pragma": "no-cache",
};

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

  const authorization = request.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return reply({ error: "login_required" }, 401);
  }

  const data = await request.json().catch(() => null);
  const password = data && typeof data === "object" && !Array.isArray(data) &&
    typeof data.password === "string" ? data.password : "";
  if (!password || password.length > 200) {
    return reply({ error: "password_required" }, 400);
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const publicKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !serviceKey || !publicKey) return reply({ error: "server_unavailable" }, 503);

    const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
    // Never use the service-role client for the password sign-in: that sign-in returns a user JWT.
    const admin = createClient(url, serviceKey, opts);
    const token = authorization.replace(/^Bearer\s+/i, "");
    const { data: identity, error: identityError } = await admin.auth.getUser(token);
    const currentUser = identity?.user;
    if (identityError || !currentUser?.id || !currentUser.email) {
      return reply({ error: "login_required" }, 401);
    }

    // Reverify the actual account password, not a password stored in our database.
    const checker = createClient(url, publicKey, opts);
    const { data: verified, error: passwordError } = await checker.auth.signInWithPassword({
      email: currentUser.email,
      password,
    });
    if (passwordError || !verified.user || verified.user.id !== currentUser.id) {
      return reply({ error: "invalid_password" }, 403);
    }

    // Only the privileged server queries secret key column, filtered by the verified JWT user id.
    const { data: licenses, error: queryError } = await admin.from("licenses")
      .select("license_key,status,issued_at,expires_at,max_devices")
      .eq("user_id", currentUser.id)
      .order("issued_at", { ascending: false })
      .limit(10);

    if (queryError) return reply({ error: "lookup_failed" }, 503);
    return reply({ licenses: licenses ?? [] });
  } catch {
    // No credentials, keys, or account-identifying data should enter logs.
    return reply({ error: "server_unavailable" }, 503);
  }
});
