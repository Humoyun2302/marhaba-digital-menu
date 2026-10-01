export function formatTableNumber(value: number): string {
  return String(value).padStart(3, "0");
}

export function normalizeQrDomain(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  return url.origin;
}

export function canLockQrDomain(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol === "https:") return true;
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function tableMenuUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/t/${token}`;
}

export function isLikelyBot(): boolean {
  if (typeof navigator === "undefined") return false;
  if (navigator.webdriver) return true;
  return /bot|crawl|spider|slurp|preview|headless|facebookexternalhit|whatsapp|telegrambot/i.test(navigator.userAgent);
}
