import type { Lang, PriceOption } from "../types/menu";

export function formatPrice(value: number): string {
  const sign = value < 0 ? "-" : "";
  const digits = Math.abs(Math.trunc(value)).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function localizedName(
  lang: Lang,
  ru: string | null | undefined,
  en: string | null | undefined,
): string {
  const primary = lang === "ru" ? ru : en;
  const fallback = lang === "ru" ? en : ru;
  return (primary || fallback || "").trim();
}

export function priceLines(options: PriceOption[], lang: Lang): string[] {
  const sorted = [...options].sort((a, b) => a.sort_order - b.sort_order || a.price - b.price);
  return sorted.map((option) => {
    const label = localizedName(lang, option.label_ru, option.label_en);
    const price = formatPrice(option.price);
    return label ? `${label} — ${price}` : price;
  });
}

export function moneySuffix(lang: Lang): string {
  return lang === "ru" ? "сум" : "UZS";
}

export function publicPriceLines(options: PriceOption[], lang: Lang): string[] {
  const suffix = moneySuffix(lang);
  return priceLines(options, lang).map((line) => `${line} ${suffix}`);
}

export function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function slugify(input: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  const mapped = [...input.trim().toLowerCase()].map((char) => map[char] ?? char).join("");
  const slug = mapped
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "category";
}

export function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = error.message;
    if (typeof message === "string" && message) return message;
  }
  return "Request failed";
}

export function storagePath(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  if (index < 0) return null;
  return decodeURIComponent(url.slice(index + marker.length).split("?")[0] ?? "");
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
