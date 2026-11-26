import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://petroscuriousmind.name.ng",
  "https://www.petroscuriousmind.name.ng",
  "https://petros-curious-mind-test.onrender.com",
]);
const cors = (origin: string | null) => {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  });
  if (origin && allowedOrigins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
};
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[ch] ?? ch));
const recentRequests = new Map<string, number[]>();
const json = (body: unknown, status: number, headers: Headers) => {
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, headers);
  if (origin && !allowedOrigins.has(origin)) return json({ error: "Origin not allowed." }, 403, headers);

  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 16000) return json({ error: "Message is too large." }, 413, headers);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    let anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!anonKey) {
      try {
        const parsed = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
        anonKey = typeof parsed.default === "string" ? parsed.default : null;
      } catch { anonKey = null; }
    }
    if (!supabaseUrl || !anonKey) return json({ error: "Account verification is temporarily unavailable." }, 503, headers);

    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "Please sign in before sending a message." }, 401, headers);
    const token = authorization.slice(7).trim();
    if (!token) return json({ error: "Please sign in before sending a message." }, 401, headers);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: "Bearer " + token } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user?.email) return json({ error: "Your session could not be verified. Please sign in again." }, 401, headers);

    const body = await req.json();
    const name = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const email = user.email;
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const honeypot = typeof body.company === "string" ? body.company.trim() : "";
    if (honeypot) return json({ success: true }, 200, headers);
    if (name.length < 2 || name.length > 80) return json({ error: "Enter a name between 2 and 80 characters." }, 400, headers);
    if (subject.length < 2 || subject.length > 120) return json({ error: "Enter a subject between 2 and 120 characters." }, 400, headers);
    if (message.length < 10 || message.length > 5000) return json({ error: "Your message must be between 10 and 5,000 characters." }, 400, headers);

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || user.id;
    const now = Date.now();
    const recent = (recentRequests.get(clientIp) || []).filter((time) => now - time < 600000);
    if (recent.length >= 3) return json({ error: "Please wait a few minutes before sending another message." }, 429, headers);
    recent.push(now);
    recentRequests.set(clientIp, recent);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("WELCOME_FROM_EMAIL");
    if (!resendKey || !fromEmail) {
      console.error("Contact email is missing Resend configuration.");
      return json({ error: "The message service is temporarily unavailable. Please try again later." }, 503, headers);
    }
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message).replace(/\r?\n/g, "<br>");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + resendKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: ["petroscuriousmind1@gmail.com"],
        reply_to: email,
        subject: "Website message: " + subject,
        html: '<!doctype html><html><body style="font-family:Arial,sans-serif;color:#342d24;background:#f7f1e5;padding:24px"><div style="max-width:620px;margin:auto;background:#fbf7ee;border:1px solid #ded2bd;border-radius:12px;padding:28px"><p style="color:#68734b;font-weight:bold;letter-spacing:1px">PETROS CURIOUS MIND · NEW MESSAGE</p><h2>' + safeSubject + '</h2><p><strong>From:</strong> ' + safeName + '</p><p><strong>Email:</strong> ' + safeEmail + '</p><hr style="border:0;border-top:1px solid #ded2bd;margin:22px 0"><p style="line-height:1.7">' + safeMessage + '</p></div></body></html>',
        text: "New website message\n\nFrom: " + name + "\nEmail: " + email + "\nSubject: " + subject + "\n\n" + message,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Resend rejected contact message:", result);
      return json({ error: "Your message could not be delivered right now. Please try again later." }, 502, headers);
    }
    return json({ success: true }, 200, headers);
  } catch (error) {
    console.error("Contact function error:", error);
    return json({ error: "Something went wrong. Please try again." }, 500, headers);
  }
});
