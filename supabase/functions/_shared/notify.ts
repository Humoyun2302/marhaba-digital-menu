import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.8";
import { orderKeyboard, orderText, type OrderView } from "./messages.ts";
import { ordersChatId, scrub } from "./supabase.ts";

type Bundle = {
  order: OrderView | null;
  notification: {
    destination_chat_id?: number | string | null;
    telegram_message_id?: number | string | null;
  } | null;
};

function token(): string {
  return Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
}

export async function telegram(method: string, body: Record<string, unknown>) {
  const bot = token();
  if (!bot) return { ok: false, description: "TELEGRAM_BOT_TOKEN is not configured" };
  try {
    const response = await fetch(`https://api.telegram.org/bot${bot}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const payload = await response.json().catch(() => ({}));
    const description = typeof payload?.description === "string" ? scrub(payload.description) : "";
    const unchanged = description.toLowerCase().includes("message is not modified");
    return { ok: Boolean(payload?.ok) || unchanged, description, result: payload?.result ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram request failed";
    return { ok: false, description: scrub(message), result: null };
  }
}

export async function deliverOrder(service: SupabaseClient, orderId: string) {
  const bundleResult = await service.rpc("order_notification_bundle", { p_order_id: orderId });
  const bundle = (bundleResult.data ?? null) as Bundle | null;
  const order = bundle?.order;
  if (!order?.id) {
    await service.rpc("complete_order_notification", { p_order_id: orderId, p_ok: false, p_error: "NOT_FOUND" });
    return;
  }
  const envChat = await ordersChatId(service);
  const chat = envChat || (bundle?.notification?.destination_chat_id ? String(bundle.notification.destination_chat_id) : "");
  if (!chat) {
    await service.rpc("complete_order_notification", {
      p_order_id: orderId,
      p_ok: false,
      p_error: "TELEGRAM_CHAT_NOT_CONFIGURED",
    });
    return;
  }
  const text = orderText(order);
  const reply_markup = orderKeyboard(order.id, order.order_status ?? "");
  const messageId = bundle?.notification?.telegram_message_id;
  if (messageId) {
    const edited = await telegram("editMessageText", {
      chat_id: chat,
      message_id: Number(messageId),
      text,
      parse_mode: "HTML",
      reply_markup,
    });
    await service.rpc("complete_order_notification", {
      p_order_id: orderId,
      p_ok: edited.ok,
      p_message_id: Number(messageId),
      p_error: edited.ok ? null : edited.description,
    });
    return;
  }
  const sent = await telegram("sendMessage", {
    chat_id: chat,
    text,
    parse_mode: "HTML",
    reply_markup,
  });
  if (!sent.ok) {
    await service.rpc("complete_order_notification", { p_order_id: orderId, p_ok: false, p_error: sent.description });
    return;
  }
  const newId = sent.result?.message_id ? Number(sent.result.message_id) : null;
  await service.rpc("complete_order_notification", { p_order_id: orderId, p_ok: true, p_message_id: newId });
}

export async function drainNotifications(service: SupabaseClient, limit = 5, orderId?: string) {
  const claimed = await service.rpc("claim_order_notifications", {
    p_limit: limit,
    p_order_id: orderId ?? null,
  });
  const rows = (claimed.data ?? []) as Array<{ order_id: string }>;
  for (const row of rows) {
    if (row.order_id) await deliverOrder(service, row.order_id);
  }
  return rows.length;
}
