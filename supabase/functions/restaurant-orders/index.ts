import { drainNotifications, telegram } from "../_shared/notify.ts";
import { clientIp, cors, errorCode, json, ordersChatId, scrub, serviceClient, sha256 } from "../_shared/supabase.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors();
  if (req.method !== "POST") return json({ error: "METHOD" }, 405);
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";
  if (action === "create") return createOrder(req, body ?? {});
  if (action === "track") return trackOrder(body ?? {});
  const admin = await requireAdmin(req);
  if (!admin) return json({ error: "NOT_ALLOWED" }, 401);
  if (action === "transition") return transition(admin.userId, body ?? {});
  if (action === "health") return health();
  if (action === "retry") return retry();
  if (action === "test") return testNotice();
  return json({ error: "NOT_FOUND" }, 404);
});

async function requireAdmin(req: Request) {
  const header = req.headers.get("Authorization") ?? "";
  const jwt = header.replace(/^Bearer\s+/i, "").trim();
  if (!jwt || jwt.startsWith("sb_") || jwt.split(".").length !== 3) return null;
  const service = serviceClient();
  const user = await service.auth.getUser(jwt);
  if (user.error || !user.data.user) return null;
  const membership = await service.from("admin_users").select("user_id").eq("user_id", user.data.user.id).maybeSingle();
  if (!membership.data) return null;
  return { userId: user.data.user.id, service };
}

async function createOrder(req: Request, body: Record<string, unknown>) {
  const service = serviceClient();
  const ip = clientIp(req);
  const chat = await ordersChatId(service);
  const payload = {
    table_token: body.tableToken,
    idempotency_key: body.idempotencyKey,
    customer_name: body.customerName ?? "",
    special_instructions: body.specialInstructions ?? "",
    allergy_notes: body.allergyNotes ?? "",
    session_secret: body.sessionSecret ?? "",
    expected_total: body.expectedTotal ?? null,
    ip_hash: ip ? await sha256(ip) : "",
    chat_id: chat,
    items: body.items,
  };
  const created = await service.rpc("create_restaurant_order", { p_payload: payload });
  if (created.error) {
    console.error(scrub(created.error.message ?? "create_restaurant_order failed"));
    return json({ error: errorCode(created.error) }, 400);
  }
  const result = created.data as { replayed?: boolean; tracking_token?: string; order?: { id?: string } };
  if (result?.order?.id && !result.replayed) {
    await drainNotifications(service, 3, result.order.id).catch(() => undefined);
  }
  return json(result);
}

async function trackOrder(body: Record<string, unknown>) {
  const token = typeof body.token === "string" ? body.token : "";
  if (!/^[0-9a-f]{64}$/i.test(token)) return json({ error: "NOT_FOUND" }, 404);
  const service = serviceClient();
  const found = await service.rpc("guest_order_by_token", { p_token: token.toLowerCase() });
  if (found.error || !found.data) return json({ error: "NOT_FOUND" }, 404);
  return json({ order: found.data });
}

async function transition(userId: string, body: Record<string, unknown>) {
  const service = serviceClient();
  const moved = await service.rpc("apply_order_transition", {
    p_order_id: body.orderId,
    p_to_status: body.toStatus,
    p_actor_type: "admin",
    p_actor_id: userId,
    p_actor_name: "Администратор",
    p_role: "manager",
    p_reason: body.reason ?? null,
    p_exceptional: Boolean(body.exceptional),
  });
  if (moved.error) return json({ error: errorCode(moved.error) }, 400);
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  if (orderId) await drainNotifications(service, 3, orderId).catch(() => undefined);
  return json({ order: moved.data });
}

async function health() {
  const service = serviceClient();
  const hasToken = Boolean(Deno.env.get("TELEGRAM_BOT_TOKEN"));
  const hasSecret = Boolean(Deno.env.get("TELEGRAM_WEBHOOK_SECRET"));
  const chatId = await ordersChatId(service);
  const me = hasToken ? await telegram("getMe", {}) : { ok: false, description: "", result: null };
  const hook = hasToken ? await telegram("getWebhookInfo", {}) : { ok: false, description: "", result: null };
  const pending = await service.from("restaurant_order_notifications").select("id", { count: "exact", head: true }).eq("delivery_status", "pending");
  const failed = await service.from("restaurant_order_notifications").select("id", { count: "exact", head: true }).eq("delivery_status", "failed");
  const webhook = (hook.result ?? {}) as { url?: string; pending_update_count?: number; last_error_message?: string };
  const bot = (me.result ?? {}) as { username?: string };
  return json({
    hasToken,
    hasSecret,
    hasChat: Boolean(chatId),
    chatId,
    botOk: me.ok,
    botUsername: bot.username ?? null,
    webhookUrl: webhook.url ?? "",
    webhookPending: webhook.pending_update_count ?? 0,
    webhookLastError: webhook.last_error_message ?? null,
    pendingNotifications: pending.count ?? 0,
    failedNotifications: failed.count ?? 0,
  });
}

async function testNotice() {
  const service = serviceClient();
  const chatId = await ordersChatId(service);
  if (!chatId) return json({ error: "TELEGRAM_CHAT_NOT_CONFIGURED" }, 400);
  const sent = await telegram("sendMessage", {
    chat_id: chatId,
    text: "MARHABA: проверка уведомлений. Бот подключён к этой группе.",
  });
  if (!sent.ok) return json({ ok: false, error: sent.description || "TELEGRAM_UNAVAILABLE" }, 502);
  return json({ ok: true });
}

async function retry() {
  const service = serviceClient();
  const requeued = await service.rpc("requeue_failed_notifications");
  if (requeued.error) return json({ error: errorCode(requeued.error) }, 400);
  const drained = await drainNotifications(service, 10);
  return json({ requeued: requeued.data ?? 0, drained });
}
