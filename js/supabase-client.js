/* Petros Curious Mind — Supabase browser client.
   Only the publishable key belongs in browser code. Never add a service_role key here. */
(function () {
  const config = {
    url: "https://lysfuszocmawivdlijqy.supabase.co",
    publishableKey: "sb_publishable_cElo0TKdntMQ25tb9UqwqA_OZXzMqz2"
  };

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("Supabase SDK did not load. Check the CDN connection.");
    return;
  }

  window.PCM = window.PCM || {};
  window.PCM.supabase = window.supabase.createClient(
    config.url,
    config.publishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
})();