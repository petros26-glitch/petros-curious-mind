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

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, headers);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    let anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!anonKey) {
      const publishableKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
      if (publishableKeys) {
        try {
          const parsed = JSON.parse(publishableKeys);
          anonKey = typeof parsed.default === "string" ? parsed.default : null;
        } catch { anonKey = undefined; }
      }
    }
    let serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
      if (secretKeys) {
        try {
          const parsed = JSON.parse(secretKeys);
          serviceKey = typeof parsed.default === "string" ? parsed.default : null;
        } catch { serviceKey = undefined; }
      }
    }
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({ error: "Account deletion is not configured on the server." }, 500, headers);
    }

    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) {
      return json({ error: "Please sign in to your account before deleting it." }, 401, headers);
    }
    const token = authorization.slice(7).trim();
    if (!token) return json({ error: "Please sign in to your account before deleting it." }, 401, headers);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: "Bearer " + token } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user?.email) {
      return json({ error: "Your session could not be verified. Please sign in and try again." }, 401, headers);
    }

    let body: { password?: unknown };
    try { body = await req.json(); } catch {
      return json({ error: "Enter your current password to confirm account deletion." }, 400, headers);
    }
    if (typeof body.password !== "string" || body.password.length < 1 || body.password.length > 1024) {
      return json({ error: "Enter your current password to confirm account deletion." }, 400, headers);
    }

    // Verify the password server-side without changing the user's browser session.
    const passwordClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: verified, error: passwordError } = await passwordClient.auth.signInWithPassword({
      email: user.email,
      password: body.password,
    });
    if (passwordError || verified.user?.id !== user.id) {
      return json({ error: "Your current password is incorrect. Your account has not been changed." }, 401, headers);
    }

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

    // Clean only records owned by this user. Stories remain published and are detached from the account.
    const { error: commentsError } = await adminClient.from("comments").delete().eq("user_id", user.id);
    if (commentsError) throw new Error("We could not remove your comments. Your account has not been deleted; please try again later.");

    const { error: likesError } = await adminClient.from("likes").delete().eq("user_id", user.id);
    if (likesError) throw new Error("We could not remove your likes. Your account has not been deleted; please try again later.");

    const { error: storyError } = await adminClient.from("stories").update({ created_by: null }).eq("created_by", user.id);
    if (storyError) throw new Error("We could not safely detach your stories. Your account has not been deleted; please try again later.");

    const { error: rolesDeleteError } = await adminClient.from("user_roles").delete().eq("user_id", user.id);
    if (rolesDeleteError) throw new Error("We could not remove your account permissions. Your account has not been deleted; please try again later.");

    const { error: profileError } = await adminClient.from("profiles").delete().eq("id", user.id);
    if (profileError) throw new Error("We could not remove your profile. Your account has not been deleted; please try again later.");

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error("Account deletion failed:", deleteError.message);
      return json({ error: "We could not complete account deletion. Your account may still exist; please contact support before retrying." }, 409, headers);
    }

    return json({ success: true, message: "Your account and personal records have been permanently deleted." }, 200, headers);
  } catch (error) {
    console.error("Account deletion error:", error instanceof Error ? error.message : "Unknown error");
    return json({ error: error instanceof Error ? error.message : "Unexpected account deletion error." }, 500, headers);
  }
});
