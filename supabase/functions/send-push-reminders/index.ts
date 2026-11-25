import * as webpush from "jsr:@negrel/webpush";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function base64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64ToBase64url(value: string): string {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function vapidKeysToJwk(publicKey: string, privateKey: string) {
  const publicBytes = base64urlToBytes(publicKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4) {
    throw new Error("La clave pública VAPID no tiene el formato P-256 esperado.");
  }
  const x = bytesToBase64url(publicBytes.slice(1, 33));
  const y = bytesToBase64url(publicBytes.slice(33, 65));
  const d = bytesToBase64url(base64urlToBytes(privateKey));
  return {
    publicKey: { kty: "EC", crv: "P-256", alg: "ES256", x, y, key_ops: ["verify"], ext: true },
    privateKey: { kty: "EC", crv: "P-256", alg: "ES256", x, y, d, key_ops: ["sign"], ext: true },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return new Response("Unauthorized", { status: 401, headers: cors });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@brillia.app";

    if (!supabaseUrl || !serviceKey || !vapidPublic || !vapidPrivate) {
      throw new Error("Faltan variables de entorno necesarias para Brillia.");
    }

    const db = createClient(supabaseUrl, serviceKey);
    const { data: subscriptions, error } = await db
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, reminder_time, timezone")
      .eq("enabled", true);

    if (error) throw new Error(`Error leyendo suscripciones: ${error.message}`);

    const keys = await webpush.importVapidKeys(vapidKeysToJwk(vapidPublic, vapidPrivate), {
      extractable: false,
    });
    const appServer = await webpush.ApplicationServer.new({
      contactInformation: vapidSubject,
      vapidKeys: keys,
    });

    const now = new Date();
    let sent = 0;
    let expired = 0;
    let failed = 0;

    for (const row of subscriptions ?? []) {
      let localTime: string;
      try {
        localTime = new Intl.DateTimeFormat("en-GB", {
          timeZone: row.timezone || "Europe/Madrid",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(now);
      } catch (error) {
        console.error("Zona horaria inválida", row.timezone, error);
        failed++;
        continue;
      }

      if (localTime !== String(row.reminder_time).slice(0, 5)) continue;

      try {
        const subscriber = appServer.subscribe({
          endpoint: row.endpoint,
          keys: {
            p256dh: base64ToBase64url(row.p256dh),
            auth: base64ToBase64url(row.auth),
          },
        });
        await subscriber.pushTextMessage(
          JSON.stringify({
            title: "Brillia · Un pequeño paso",
            body: "Es un buen momento para dedicar unos minutos a tu hogar. ✨",
            url: "/",
          }),
          {},
        );
        sent++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Error enviando push", message);
        if (message.includes("404") || message.includes("410") || message.includes("Gone")) {
          await db.from("push_subscriptions").delete().eq("id", row.id);
          expired++;
        } else {
          failed++;
        }
      }
    }

    return Response.json({
      checked: subscriptions?.length ?? 0,
      sent,
      expired,
      failed,
    }, { headers: cors });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Brillia push function error:", message);
    return Response.json({ error: message }, { status: 500, headers: cors });
  }
});
