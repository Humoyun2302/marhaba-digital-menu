import { handleUpdate } from "../_shared/bot.ts";
import { drainNotifications } from "../_shared/notify.ts";
import { serviceClient } from "../_shared/supabase.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

function safeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  const secret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";
  const provided = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!secret || !safeEqual(provided, secret)) return new Response("unauthorized", { status: 401 });

  const update = await req.json().catch(() => null) as Record<string, unknown> | null;
  const updateId = typeof update?.update_id === "number" ? update.update_id : null;
  if (!update || updateId === null) return new Response("ok", { status: 200 });

  const service = serviceClient();
  const recorded = await service.rpc("record_telegram_update", { p_update_id: updateId });
  if (recorded.error) return new Response("retry", { status: 500 });
  if (recorded.data !== true) return new Response("ok", { status: 200 });

  try {
    await handleUpdate(service, update);
    await drainNotifications(service, 5);
    return new Response("ok", { status: 200 });
  } catch {
    await service.rpc("release_telegram_update", { p_update_id: updateId });
    return new Response("retry", { status: 500 });
  }
});
