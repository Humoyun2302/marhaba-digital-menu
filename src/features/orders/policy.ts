import type { Category, Lang } from "../../types/menu";
import { localizedName } from "../../utils/format";

export const ORDER_STATUSES = ["pending", "accepted", "preparing", "ready", "served", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number] | "serving";

const NEXT: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending: ["accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready"],
  ready: ["served"],
  serving: ["served"],
};

export function isOrderStatus(value: string): value is OrderStatus {
  return value === "serving" || (ORDER_STATUSES as readonly string[]).includes(value);
}

export function forwardActions(from: OrderStatus): OrderStatus[] {
  return (NEXT[from] ?? []).filter((status) => status !== "cancelled");
}

export function canCancel(from: OrderStatus): boolean {
  return (NEXT[from] ?? []).includes("cancelled");
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (NEXT[from] ?? []).includes(to);
}

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export type CartLine = {
  itemId: string;
  optionId: string;
  quantity: number;
  note: string;
};

export type ResolvedLine = {
  itemId: string;
  optionId: string;
  note: string;
  name: string;
  variant: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  issue: "ok" | "missing" | "unavailable" | "variant";
};

export function addCartLine(lines: CartLine[], next: CartLine, maxQuantity = 20): CartLine[] {
  const quantity = Math.min(maxQuantity, Math.max(1, Math.trunc(next.quantity)));
  const note = next.note.trim().slice(0, 200);
  const index = lines.findIndex((line) => line.itemId === next.itemId && line.optionId === next.optionId && line.note === note);
  if (index < 0) return [...lines, { ...next, quantity, note }];
  return lines.map((line, lineIndex) => (
    lineIndex === index ? { ...line, quantity: Math.min(maxQuantity, line.quantity + quantity) } : line
  ));
}

export function resolveCart(lines: CartLine[], categories: Category[], lang: Lang): ResolvedLine[] {
  const items = categories.flatMap((category) => category.menu_items.map((item) => ({ ...item, categoryActive: category.is_active })));
  return lines.map((line) => {
    const item = items.find((candidate) => candidate.id === line.itemId);
    if (!item) {
      return { ...line, name: "", variant: "", unitPrice: 0, lineTotal: 0, issue: "missing" };
    }
    const name = localizedName(lang, item.name_ru, item.name_en);
    if (!item.is_available || !item.categoryActive) {
      return { ...line, name, variant: "", unitPrice: 0, lineTotal: 0, issue: "unavailable" };
    }
    const option = item.item_price_options.find((candidate) => candidate.id === line.optionId);
    if (!option || (item.item_price_options.length > 1 && !line.optionId)) {
      return { ...line, name, variant: "", unitPrice: 0, lineTotal: 0, issue: "variant" };
    }
    const variant = localizedName(lang, option.label_ru, option.label_en);
    return {
      ...line,
      name,
      variant,
      unitPrice: option.price,
      lineTotal: option.price * line.quantity,
      issue: "ok",
    };
  });
}

export function payableTotal(lines: ResolvedLine[]): number {
  return lines.reduce((sum, line) => (line.issue === "ok" ? sum + line.lineTotal : sum), 0);
}
