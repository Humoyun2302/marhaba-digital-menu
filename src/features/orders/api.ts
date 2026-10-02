import { requireSupabase } from "../../lib/supabase";
import type { OrderStatus } from "./policy";

export class OrderError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const CODES = [
  "ORDERING_DISABLED",
  "ORDERS_PAUSED",
  "OUTSIDE_HOURS",
  "INVALID_TABLE",
  "INVALID_ITEMS",
  "VARIANT_REQUIRED",
  "QUANTITY_LIMIT",
  "ITEM_UNAVAILABLE",
  "TOTAL_LIMIT",
  "RATE_LIMIT",
  "IDEMPOTENCY_CONFLICT",
  "UNAVAILABLE",
  "NOT_ALLOWED",
  "NOT_FOUND",
  "INVALID_TRANSITION",
  "REASON_REQUIRED",
  "ORDER_FAILED",
  "FUNCTION_MISSING",
  "TELEGRAM_CHAT_NOT_CONFIGURED",
  "SESSION_INVALID",
  "SESSION_EXPIRED",
  "SESSION_REVOKED",
  "SESSION_TABLE_MISMATCH",
  "CONFIRM_REQUIRED",
  "PRICE_CHANGED",
];

export type OrderingStatus = {
  accepting: boolean;
  closedReason: string | null;
  orderingEnabled: boolean;
  ordersPaused: boolean;
  allowOutsideHours: boolean;
};

export type GuestItem = {
  id: string;
  nameRu: string;
  nameEn: string | null;
  variantRu: string | null;
  variantEn: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  note: string | null;
};

export type TimelineEvent = {
  id: string;
  status: OrderStatus;
  actorType: string;
  actorName: string | null;
  reason: string | null;
  createdAt: string;
};

export type GuestOrder = {
  id: string;
  publicOrderNumber: number;
  tableNumber: number;
  status: OrderStatus;
  customerName: string | null;
  specialInstructions: string | null;
  allergyNotes: string | null;
  totalAmount: number;
  paymentStatus: string;
  prepEstimateMinutes: number | null;
  cancellationReason: string | null;
  createdAt: string;
  items: GuestItem[];
  timeline: TimelineEvent[];
};

type RawOrder = {
  id: string;
  public_order_number: number;
  table_number: number;
  order_status: OrderStatus;
  customer_name: string | null;
  special_instructions: string | null;
  allergy_notes: string | null;
  total_amount: number;
  payment_status: string;
  prep_estimate_minutes: number | null;
  cancellation_reason: string | null;
  created_at: string;
  items: Array<{
    id: string;
    name_ru: string;
    name_en: string | null;
    variant_ru: string | null;
    variant_en: string | null;
    quantity: number;
    unit_price: number;
    line_total: number;
    special_instructions: string | null;
  }>;
  timeline: Array<{
    id: string;
    status: OrderStatus;
    actor_type: string;
    actor_name: string | null;
    reason: string | null;
    created_at: string;
  }>;
};

function mapOrder(raw: RawOrder): GuestOrder {
  return {
    id: raw.id,
    publicOrderNumber: raw.public_order_number,
    tableNumber: raw.table_number,
    status: raw.order_status,
    customerName: raw.customer_name,
    specialInstructions: raw.special_instructions,
    allergyNotes: raw.allergy_notes,
    totalAmount: raw.total_amount,
    paymentStatus: raw.payment_status,
    prepEstimateMinutes: raw.prep_estimate_minutes,
    cancellationReason: raw.cancellation_reason,
    createdAt: raw.created_at,
    items: (raw.items ?? []).map((item) => ({
      id: item.id,
      nameRu: item.name_ru,
      nameEn: item.name_en,
      variantRu: item.variant_ru,
      variantEn: item.variant_en,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      lineTotal: item.line_total,
      note: item.special_instructions,
    })),
    timeline: (raw.timeline ?? []).map((event) => ({
      id: event.id,
      status: event.status,
      actorType: event.actor_type,
      actorName: event.actor_name,
      reason: event.reason,
      createdAt: event.created_at,
    })),
  };
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("restaurant-orders", { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === "function") {
      const payload = await context.json().catch(() => null) as { error?: string } | null;
      if (payload?.error && CODES.includes(payload.error)) throw new OrderError(payload.error);
    }
    if (/failed to send|function|404|not found/i.test(error.message)) throw new OrderError("FUNCTION_MISSING");
    const code = CODES.find((item) => error.message.includes(item));
    throw new OrderError(code ?? "ORDER_FAILED");
  }
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
    throw new OrderError(CODES.includes(data.error) ? data.error : "ORDER_FAILED");
  }
  return data as T;
}

export async function fetchOrderingStatus(): Promise<OrderingStatus> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("public_ordering_status");
  if (error) {
    if (/function|schema|PGRST202|does not exist/i.test(error.message)) {
      return { accepting: false, closedReason: "UNAVAILABLE", orderingEnabled: false, ordersPaused: false, allowOutsideHours: true };
    }
    throw new Error(error.message);
  }
  const row = data as { accepting?: boolean; closed_reason?: string | null; ordering_enabled?: boolean; orders_paused?: boolean; allow_outside_hours?: boolean };
  return {
    accepting: Boolean(row.accepting),
    closedReason: row.closed_reason ?? null,
    orderingEnabled: Boolean(row.ordering_enabled),
    ordersPaused: Boolean(row.orders_paused),
    allowOutsideHours: Boolean(row.allow_outside_hours),
  };
}

export type OpenedVisit = {
  sessionId: string;
  secret: string;
  tableNumber: number;
  resumed: boolean;
};

export type GuestOrderBoard = {
  active: Array<GuestOrder & { trackingToken: string }>;
  recent: Array<GuestOrder & { trackingToken: string }>;
};

const visitOpens = new Map<string, Promise<OpenedVisit>>();

export async function openGuestVisit(token: string, options?: { forceNew?: boolean }): Promise<OpenedVisit> {
  const key = `${token}:${options?.forceNew ? "new" : "resume"}`;
  const existing = visitOpens.get(key);
  if (existing) return existing;
  const promise = openGuestVisitRequest(token, options).finally(() => visitOpens.delete(key));
  visitOpens.set(key, promise);
  return promise;
}

async function openGuestVisitRequest(token: string, options?: { forceNew?: boolean }): Promise<OpenedVisit> {
  const client = requireSupabase();
  const { secretForOpen, readActiveVisit } = await import("./storage");
  const active = readActiveVisit();
  const secret = options?.forceNew && active?.token === token ? active.secret : secretForOpen(token);
  const { data, error } = await client.rpc("open_guest_visit", {
    p_token: token,
    p_secret: secret,
    p_force_new: Boolean(options?.forceNew),
  });
  if (error) {
    if (/function|schema|PGRST202|does not exist/i.test(error.message)) throw new OrderError("FUNCTION_MISSING");
    const code = CODES.find((item) => error.message.includes(item));
    throw new OrderError(code ?? "ORDER_FAILED");
  }
  const row = data as { session_id?: string; session_secret?: string; table_number?: number; resumed?: boolean };
  if (!row?.session_id || !row.session_secret || !row.table_number) throw new OrderError("INVALID_TABLE");
  return {
    sessionId: row.session_id,
    secret: row.session_secret,
    tableNumber: Number(row.table_number),
    resumed: Boolean(row.resumed),
  };
}

export async function fetchGuestOrders(secret: string): Promise<GuestOrderBoard> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("guest_active_orders", { p_secret: secret });
  if (error) {
    const code = CODES.find((item) => error.message.includes(item));
    throw new OrderError(code ?? "NOT_FOUND");
  }
  const row = data as { active?: RawTracked[]; recent?: RawTracked[] };
  return {
    active: (row.active ?? []).map(mapTracked),
    recent: (row.recent ?? []).map(mapTracked),
  };
}

type RawTracked = RawOrder & { tracking_token?: string };

function mapTracked(raw: RawTracked): GuestOrder & { trackingToken: string } {
  return { ...mapOrder(raw), trackingToken: raw.tracking_token ?? "" };
}

export type TableBoardRow = {
  tableNumber: number;
  activeOrders: number;
  activeVisits: number;
};

export async function fetchTableBoard(): Promise<TableBoardRow[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_table_board");
  if (error) throw new OrderError(CODES.find((item) => error.message.includes(item)) ?? "ORDER_FAILED");
  const rows = (data ?? []) as Array<{ table_number: number; active_orders: number; active_visits: number }>;
  return rows.map((row) => ({
    tableNumber: Number(row.table_number),
    activeOrders: Number(row.active_orders) || 0,
    activeVisits: Number(row.active_visits) || 0,
  }));
}

export async function releaseTable(tableNumber: number, unfinished: "cancel" | "serve"): Promise<{ token: string; revokedVisits: number; finishedOrders: number }> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_release_table", {
    p_table_number: tableNumber,
    p_unfinished: unfinished,
  });
  if (error) throw new OrderError(CODES.find((item) => error.message.includes(item)) ?? "ORDER_FAILED");
  const row = data as { token?: string; revoked_visits?: number; finished_orders?: number };
  return {
    token: row.token ?? "",
    revokedVisits: Number(row.revoked_visits) || 0,
    finishedOrders: Number(row.finished_orders) || 0,
  };
}

export async function createOrder(input: {
  tableToken: string;
  idempotencyKey: string;
  customerName: string;
  specialInstructions: string;
  allergyNotes: string;
  sessionSecret: string;
  expectedTotal: number;
  items: Array<{ menuItemId: string; priceOptionId: string; quantity: number; note: string }>;
}): Promise<{ replayed: boolean; trackingToken: string; order: GuestOrder; notificationStatus: string | null }> {
  const result = await invoke<{ replayed: boolean; tracking_token: string; order: RawOrder; notification_status?: string | null }>({
    action: "create",
    tableToken: input.tableToken,
    idempotencyKey: input.idempotencyKey,
    customerName: input.customerName,
    specialInstructions: input.specialInstructions,
    allergyNotes: input.allergyNotes,
    sessionSecret: input.sessionSecret,
    expectedTotal: input.expectedTotal,
    items: input.items.map((item) => ({
      menu_item_id: item.menuItemId,
      price_option_id: item.priceOptionId,
      quantity: item.quantity,
      special_instructions: item.note,
    })),
  });
  return {
    replayed: Boolean(result.replayed),
    trackingToken: result.tracking_token,
    order: mapOrder(result.order),
    notificationStatus: result.notification_status ?? null,
  };
}

export async function trackOrder(token: string): Promise<GuestOrder> {
  const result = await invoke<{ order: RawOrder }>({ action: "track", token });
  return mapOrder(result.order);
}

export async function transitionOrder(input: { orderId: string; toStatus: OrderStatus; reason?: string; exceptional?: boolean }) {
  await invoke({
    action: "transition",
    orderId: input.orderId,
    toStatus: input.toStatus,
    reason: input.reason ?? null,
    exceptional: Boolean(input.exceptional),
  });
}

export type BotHealth = {
  hasToken: boolean;
  hasSecret: boolean;
  hasChat: boolean;
  chatId: string | null;
  botOk: boolean;
  botUsername: string | null;
  webhookUrl: string;
  webhookPending: number;
  webhookLastError: string | null;
  pendingNotifications: number;
  failedNotifications: number;
};

export async function fetchBotHealth(): Promise<BotHealth> {
  return invoke<BotHealth>({ action: "health" });
}

export async function retryNotifications(): Promise<{ requeued: number; drained: number }> {
  return invoke({ action: "retry" });
}

export async function sendTestNotification(): Promise<{ ok: boolean }> {
  return invoke({ action: "test" });
}
