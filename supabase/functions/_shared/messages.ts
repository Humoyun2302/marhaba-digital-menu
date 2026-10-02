export type OrderItemView = {
  name_ru?: string | null;
  variant_ru?: string | null;
  quantity?: number;
  line_total?: number;
  special_instructions?: string | null;
};

export type OrderView = {
  id?: string;
  public_order_number?: number;
  table_number?: number;
  order_status?: string;
  customer_name?: string | null;
  special_instructions?: string | null;
  allergy_notes?: string | null;
  total_amount?: number;
  cancellation_reason?: string | null;
  items?: OrderItemView[];
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Новый заказ",
  accepted: "Принят",
  preparing: "Готовится",
  ready: "Готов",
  serving: "Готов",
  served: "Заказ выполнен",
  cancelled: "Отменён",
};

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function formatMoney(amount: number): string {
  const digits = Math.abs(Math.trunc(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${digits} сум`;
}

export function orderText(order: OrderView): string {
  const status = order.order_status ?? "pending";
  const title = status === "pending"
    ? `🍽 <b>НОВЫЙ ЗАКАЗ №${order.public_order_number ?? ""}</b>`
    : `🍽 <b>ЗАКАЗ №${order.public_order_number ?? ""}</b>`;
  const items = (order.items ?? []).map((item) => {
    const variant = item.variant_ru?.trim();
    const name = variant ? `${item.name_ru ?? "Блюдо"} (${variant})` : (item.name_ru ?? "Блюдо");
    return `${item.quantity ?? 0} × ${escapeHtml(name)} — ${formatMoney(item.line_total ?? 0)}`;
  });
  const comment = [order.special_instructions, order.allergy_notes].filter(Boolean).join(". ");
  const lines = [
    title,
    "",
    `<b>Стол:</b> ${order.table_number ?? ""}`,
    "",
    "<b>Заказ:</b>",
    "",
    items.join("\n") || "—",
    "",
    `<b>Итого: ${formatMoney(order.total_amount ?? 0)}</b>`,
  ];
  if (comment) lines.push("", `Комментарий: ${escapeHtml(comment)}`);
  if (order.cancellation_reason && status === "cancelled") lines.push("", `Причина: ${escapeHtml(order.cancellation_reason)}`);
  lines.push("", `<b>Статус: ${STATUS_LABEL[status] ?? escapeHtml(status)}</b>`);
  return lines.join("\n");
}

export function orderKeyboard(orderId: string, status: string) {
  const id = orderId.replaceAll("-", "");
  const button = (text: string, action: string) => ({ text, callback_data: `${action}${id}` });
  const rows = [];
  if (status === "pending") rows.push([button("✅ Принять", "y"), button("❌ Отклонить", "n")]);
  if (status === "accepted") rows.push([button("Начать готовить", "k"), button("Отменить", "x")]);
  if (status === "preparing") rows.push([button("Готово", "r")]);
  if (status === "ready" || status === "serving") rows.push([button("Подано", "s")]);
  return { inline_keyboard: rows };
}

export function compactToUuid(value: string): string | null {
  if (!/^[0-9a-f]{32}$/i.test(value)) return null;
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`.toLowerCase();
}

export const CALLBACK_STATUS: Record<string, string> = {
  y: "accepted",
  n: "cancelled",
  k: "preparing",
  x: "cancelled",
  r: "ready",
  s: "served",
};
