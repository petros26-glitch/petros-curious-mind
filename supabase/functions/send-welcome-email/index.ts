import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("WELCOME_FROM_EMAIL");
    const siteUrl = "https://petroscuriousmind.name.ng";
    if (!supabaseUrl || !anonKey || !resendKey || !fromEmail) {
      throw new Error("Welcome email service is not fully configured.");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.email) {
      return new Response(JSON.stringify({ error: "Valid signed-in account required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const rawName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const name = escapeHtml(rawName || "there");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [user.email],
        subject: "Welcome to Petros Curious Mind",
        html: `<!doctype html><html><body style="margin:0;background:#f7f1e5;color:#342d24;font-family:Georgia,serif;padding:32px"><div style="max-width:600px;margin:auto;background:#fbf7ee;padding:32px;border:1px solid #ded2bd;border-radius:12px"><p style="color:#68734b;letter-spacing:2px;text-transform:uppercase;font:12px Arial,sans-serif">Petros Curious Mind</p><h1 style="font-weight:normal">Welcome, ${name}.</h1><p>We're glad you're here. Step into a world of folklore, timeless tales and the stories passed from one generation to another.</p><p>Discover the story behind every story.</p><p><a href="${siteUrl}" style="display:inline-block;background:#68734b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px">Explore stories</a></p><p style="font-size:13px;color:#766b5c">The Petros Curious Mind team</p></div></body></html>`,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return new Response(JSON.stringify({ error: "Email provider rejected the message", details: result }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ success: true, id: result.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
