import type { CartLine } from "./policy";

const ACTIVE_KEY = "marhaba:active-visit:v2";
const TAB_KEY = "marhaba:tab:v2";
const RECOVERY_PREFIX = "marhaba:visit-recovery:v2:";
const HOLDER_PREFIX = "marhaba:visit-holder:v2:";
const CART_PREFIX = "marhaba:cart:v2:";
const CHECKOUT_PREFIX = "marhaba:checkout:v2:";
const NOTICE_KEY = "marhaba:done-notice:v2";
const LEGACY_KEYS = ["marhaba.cart.v1", "marhaba.table.v1", "marhaba.orders.v1"];

const CART_TTL_MS = 4 * 60 * 60 * 1000;
const RECOVERY_TTL_MS = 12 * 60 * 60 * 1000;
const HOLDER_FRESH_MS = 20_000;

export type ActiveVisit = {
  token: string;
  tableNumber: number;
  sessionId: string;
  secret: string;
  resumed: boolean;
  boundAt: number;
};

export type CompletionNotice = {
  publicNumber: number;
  status: "served" | "cancelled";
  reason: string | null;
};

type StoredCart = {
  updatedAt: number;
  lines: CartLine[];
};

type RecoveryRecord = {
  secret: string;
  sessionId: string;
  savedAt: number;
};

type HolderRecord = {
  tabId: string;
  sessionId: string;
  seenAt: number;
};

function memory(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function tabMemory(): Storage | null {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}

function readJson<T>(store: Storage | null, key: string): T | null {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(store: Storage | null, key: string, value: unknown) {
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

export function cartStorageKey(token: string, sessionId: string): string {
  return `${CART_PREFIX}${token}:${sessionId}`;
}

export function discardLegacyCart() {
  const store = memory();
  if (!store) return;
  for (const key of LEGACY_KEYS) store.removeItem(key);
}

export function tabId(): string {
  const store = tabMemory();
  const existing = store?.getItem(TAB_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  try {
    store?.setItem(TAB_KEY, created);
  } catch {
    /* ignore */
  }
  return created;
}

export function readActiveVisit(): ActiveVisit | null {
  const visit = readJson<ActiveVisit>(tabMemory(), ACTIVE_KEY);
  if (!visit?.token || !visit.sessionId || !visit.secret || !visit.tableNumber) return null;
  return visit;
}

export function writeActiveVisit(visit: ActiveVisit) {
  writeJson(tabMemory(), ACTIVE_KEY, visit);
  writeJson(memory(), `${RECOVERY_PREFIX}${visit.token}`, {
    secret: visit.secret,
    sessionId: visit.sessionId,
    savedAt: Date.now(),
  } satisfies RecoveryRecord);
  writeHolder(visit.token, visit.sessionId);
}

export function clearActiveVisit(visit: ActiveVisit | null) {
  tabMemory()?.removeItem(ACTIVE_KEY);
  if (!visit) return;
  const store = memory();
  const recovery = readJson<RecoveryRecord>(store, `${RECOVERY_PREFIX}${visit.token}`);
  if (recovery?.sessionId === visit.sessionId) store?.removeItem(`${RECOVERY_PREFIX}${visit.token}`);
  const holder = readJson<HolderRecord>(store, `${HOLDER_PREFIX}${visit.token}`);
  if (holder?.tabId === tabId()) store?.removeItem(`${HOLDER_PREFIX}${visit.token}`);
  clearScopedCart(visit.token, visit.sessionId);
}

function writeHolder(token: string, sessionId: string) {
  writeJson(memory(), `${HOLDER_PREFIX}${token}`, {
    tabId: tabId(),
    sessionId,
    seenAt: Date.now(),
  } satisfies HolderRecord);
}

export function touchVisitHolder(token: string, sessionId: string) {
  writeHolder(token, sessionId);
}

export function releaseVisitHolder(token: string) {
  const store = memory();
  const holder = readJson<HolderRecord>(store, `${HOLDER_PREFIX}${token}`);
  if (holder?.tabId === tabId()) store?.removeItem(`${HOLDER_PREFIX}${token}`);
}

export function secretForOpen(token: string): string {
  const active = readActiveVisit();
  if (active?.token === token && active.secret) return active.secret;
  const holder = readJson<HolderRecord>(memory(), `${HOLDER_PREFIX}${token}`);
  if (holder && holder.tabId !== tabId() && Date.now() - holder.seenAt < HOLDER_FRESH_MS) return "";
  const recovery = readJson<RecoveryRecord>(memory(), `${RECOVERY_PREFIX}${token}`);
  if (!recovery?.secret || Date.now() - recovery.savedAt > RECOVERY_TTL_MS) return "";
  return recovery.secret;
}

export function readScopedCart(token: string, sessionId: string): CartLine[] {
  const stored = readJson<StoredCart>(memory(), cartStorageKey(token, sessionId));
  if (!stored || !Array.isArray(stored.lines)) return [];
  if (!stored.updatedAt || Date.now() - stored.updatedAt > CART_TTL_MS) {
    clearScopedCart(token, sessionId);
    return [];
  }
  return stored.lines.filter((line) => line.itemId && line.optionId && line.quantity > 0);
}

export function writeScopedCart(token: string, sessionId: string, lines: CartLine[]) {
  writeJson(memory(), cartStorageKey(token, sessionId), {
    updatedAt: Date.now(),
    lines,
  } satisfies StoredCart);
}

export function clearScopedCart(token: string, sessionId: string) {
  memory()?.removeItem(cartStorageKey(token, sessionId));
}

export function previousSessionId(token: string): string | null {
  return readJson<RecoveryRecord>(memory(), `${RECOVERY_PREFIX}${token}`)?.sessionId ?? null;
}

export function readCompletionNotice(): CompletionNotice | null {
  const notice = readJson<CompletionNotice>(tabMemory(), NOTICE_KEY);
  if (!notice?.publicNumber || (notice.status !== "served" && notice.status !== "cancelled")) return null;
  return notice;
}

export function writeCompletionNotice(notice: CompletionNotice) {
  writeJson(tabMemory(), NOTICE_KEY, notice);
}

export function clearCompletionNotice() {
  tabMemory()?.removeItem(NOTICE_KEY);
}

export function checkoutKey(sessionId: string, signature: string): string {
  const storageKey = `${CHECKOUT_PREFIX}${sessionId}`;
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) {
      const parsed = JSON.parse(existing) as { signature?: string; key?: string };
      if (parsed.signature === signature && parsed.key) return parsed.key;
    }
    const created = crypto.randomUUID();
    sessionStorage.setItem(storageKey, JSON.stringify({ signature, key: created }));
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export function clearCheckoutKey(sessionId: string) {
  try {
    sessionStorage.removeItem(`${CHECKOUT_PREFIX}${sessionId}`);
  } catch {
    /* ignore */
  }
}
