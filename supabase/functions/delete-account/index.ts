import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://petroscuriousmind.name.ng",
  "https://www.petroscuriousmind.name.ng",
  "https://petros-curious-mind-test.onrender.com",
]);

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && allowedOrigins.has(origin)
    ? origin
    : "https://petroscuriousmind.name.ng";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: Record<string, unknown>, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function getAuthTime(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
    return typeof decoded.auth_time === "number" ? decoded.auth_time : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, headers);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({ error: "Account deletion is not configured on the server." }, 500, headers);
    }

    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token || token === authorization) {
      return json({ error: "Please sign in again before deleting your account." }, 401, headers);
    }

    const authTime = getAuthTime(token);
    const now = Math.floor(Date.now() / 1000);
    if (!authTime || now - authTime > 5 * 60 || authTime > now + 30) {
      return json({ error: "For your security, sign in again and then retry account deletion." }, 401, headers);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) return json({ error: "Your session could not be verified. Please sign in again." }, 401, headers);

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: roles, error: rolesError } = await adminClient
      .from("user_roles").select("role").eq("user_id", user.id);
    if (rolesError) throw new Error("We could not verify your account permissions. Please try again later.");

    if ((roles || []).some((item) => item.role === "admin")) {
      const { data: admins, error: adminsError } = await adminClient
        .from("user_roles").select("user_id").eq("role", "admin");
      if (adminsError) throw new Error("We could not verify administrator access. Please try again later.");
      if ((admins || []).length <= 1) {
        return json({
          error: "This is the only administrator account. Add another administrator before deleting this account, so the website can still be managed."
        }, 409, headers);
      }
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error("Account deletion failed:", deleteError.message);
      return json({
        error: "We could not complete account deletion. If this account owns uploaded files, those files must be transferred or removed first."
      }, 409, headers);
    }

    return json({ success: true, message: "Your account and associated personal records have been permanently deleted." }, 200, headers);
  } catch (error) {
    console.error("Account deletion error:", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected account deletion error." }, 500, headers);
  }
});
