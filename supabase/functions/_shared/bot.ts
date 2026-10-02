import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.8";
import { CALLBACK_STATUS, compactToUuid } from "./messages.ts";
import { drainNotifications, telegram } from "./notify.ts";
import { errorCode, ordersChatId } from "./supabase.ts";

const START = [
  "MARHABA HOTEL & SPA",
  "Бот отправляет заказы со столов в группу ресторана.",
  "Кнопки под заказом меняют статус. Ими может пользоваться любой участник этой группы.",
  "",
  "/chatid — ID текущего чата",
].join("\n");

function commandOf(text: string): { name: string; args: string } | null {
  const match = text.trim().match(/^\/([a-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/i);
  if (!match?.[1]) return null;
  return { name: match[1].toLowerCase(), args: (match[2] ?? "").trim() };
}

async function reply(chatId: number, text: string) {
  await telegram("sendMessage", { chat_id: chatId, text });
}

function senderName(from: { first_name?: string; last_name?: string; username?: string }): string {
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  return (name || (from.username ? `@${from.username}` : "Сотрудник")).slice(0, 80);
}

async function isGroupMember(chatId: string, userId: number): Promise<boolean> {
  const member = await telegram("getChatMember", { chat_id: chatId, user_id: userId });
  const result = member.result as { status?: string; is_member?: boolean } | null;
  const status = result?.status ?? "";
  if (status === "creator" || status === "administrator" || status === "member") return true;
  return status === "restricted" && result?.is_member !== false;
}

export async function handleUpdate(service: SupabaseClient, update: Record<string, unknown>) {
  if (update.callback_query && typeof update.callback_query === "object") {
    await handleCallback(service, update.callback_query as Record<string, unknown>);
    return;
  }
  const message = update.message;
  if (!message || typeof message !== "object") return;
  const record = message as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text : "";
  const chat = record.chat as { id?: number } | undefined;
  if (!chat?.id || !text.startsWith("/")) return;
  const command = commandOf(text);
  if (!command) return;
  if (command.name === "start") {
    await reply(chat.id, START);
    return;
  }
  if (command.name === "chatid") {
    await reply(chat.id, `Chat ID: ${chat.id}`);
  }
}

async function handleCallback(service: SupabaseClient, query: Record<string, unknown>) {
  const id = typeof query.id === "string" ? query.id : "";
  const data = typeof query.data === "string" ? query.data : "";
  const from = query.from as { id?: number; first_name?: string; last_name?: string; username?: string } | undefined;
  const message = query.message as { chat?: { id?: number }; message_id?: number } | undefined;
  const answer = (text: string) => telegram("answerCallbackQuery", { callback_query_id: id, text });
  if (!from?.id || !data || !message?.chat?.id) {
    await answer("Не удалось обработать кнопку.");
    return;
  }

  const configured = await ordersChatId(service);
  if (!configured || String(message.chat.id) !== configured) {
    await answer("Кнопка работает только в группе ресторана.");
    return;
  }
  if (!await isGroupMember(configured, from.id)) {
    await answer("Только участники группы могут менять заказы.");
    return;
  }

  const action = data.slice(0, 1);
  const orderId = compactToUuid(data.slice(1));
  const next = CALLBACK_STATUS[action];
  if (!orderId || !next) {
    await answer("Кнопка устарела.");
    return;
  }

  const reason = next === "cancelled" ? (action === "n" ? "Отклонено" : "Отменено") : null;
  const moved = await service.rpc("apply_order_transition", {
    p_order_id: orderId,
    p_to_status: next,
    p_actor_type: "staff",
    p_actor_id: String(from.id),
    p_actor_name: senderName(from),
    p_role: "group",
    p_reason: reason,
    p_exceptional: false,
  });
  if (moved.error) {
    const code = errorCode(moved.error);
    await answer(code === "INVALID_TRANSITION" ? "Статус уже изменён." : "Не удалось обновить заказ.");
    return;
  }
  await drainNotifications(service, 3, orderId);
  await answer("Статус обновлён.");
}
