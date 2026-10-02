import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.8";

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

export function cors(): Response {
  return new Response("ok", {
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

const ORDER_CODES = [
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
  "INVALID_STATUS",
  "LINK_INVALID",
  "ALREADY_LINKED",
  "TELEGRAM_CHAT_NOT_CONFIGURED",
  "SESSION_INVALID",
  "SESSION_EXPIRED",
  "SESSION_REVOKED",
  "SESSION_TABLE_MISMATCH",
  "CONFIRM_REQUIRED",
  "PRICE_CHANGED",
];

export function errorCode(error: { message?: string } | null): string {
  const message = error?.message ?? "";
  return ORDER_CODES.find((code) => message.includes(code)) ?? "ORDER_FAILED";
}

export function scrub(value: string): string {
  return value.replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[redacted]").slice(0, 500);
}

export function configuredChatId(): string | null {
  const raw = Deno.env.get("TELEGRAM_ORDERS_CHAT_ID")?.trim() ?? "";
  return /^-?\d{1,20}$/.test(raw) ? raw : null;
}

export async function ordersChatId(service: SupabaseClient): Promise<string | null> {
  const envChat = configuredChatId();
  if (envChat) return envChat;
  const settings = await service.from("restaurant_order_settings").select("orders_chat_id").eq("singleton", true).maybeSingle();
  const stored = settings.data?.orders_chat_id;
  if (stored === null || stored === undefined || stored === "") return null;
  const text = String(stored);
  return /^-?\d{1,20}$/.test(text) ? text : null;
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return forwarded || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "";
}
