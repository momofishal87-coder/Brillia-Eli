import webpush from "npm:web-push";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return new Response("Unauthorized", { status: 401, headers: cors });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")!;
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")!;
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@brillia.app";

  const db = createClient(supabaseUrl, serviceKey);
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const { data: subscriptions, error } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, reminder_time, timezone")
    .eq("enabled", true);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });

  const now = new Date();
  let sent = 0, expired = 0, failed = 0;
  for (const row of subscriptions ?? []) {
    let localTime = "";
    try {
      localTime = new Intl.DateTimeFormat("en-GB", {
        timeZone: row.timezone || "Europe/Madrid",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(now);
    } catch (_) { failed++; continue; }

    const due = String(row.reminder_time).slice(0, 5);
    if (localTime !== due) continue;

    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        JSON.stringify({
          title: "Brillia · Un pequeño paso",
          body: "Es un buen momento para dedicar unos minutos a tu hogar. ✨",
          url: "/",
        }),
      );
      sent++;
    } catch (e) {
      const status = e?.statusCode;
      if (status === 404 || status === 410) {
        await db.from("push_subscriptions").delete().eq("id", row.id);
        expired++;
      } else {
        console.error("Push send failed", status, e?.message);
        failed++;
      }
    }
  }

  return new Response(JSON.stringify({ checked: subscriptions?.length ?? 0, sent, expired, failed }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
