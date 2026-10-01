import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "../../i18n/language";
import type { MenuItem } from "../../types/menu";
import { localizedName, publicPriceLines } from "../../utils/format";
import { resolveDishPhoto } from "./photos";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

type ItemDetailProps = {
  item: MenuItem | null;
  categoryName: string;
  onClose: () => void;
};

export function ItemDetail({ item, categoryName, onClose }: ItemDetailProps) {
  const { lang, t } = useLanguage();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const itemId = item?.id ?? null;

  function requestClose() {
    if (window.history.state && typeof window.history.state === "object" && "marhabaDish" in window.history.state) {
      window.history.back();
      return;
    }
    onCloseRef.current();
  }

  const requestCloseRef = useRef(requestClose);
  useEffect(() => {
    onCloseRef.current = onClose;
    requestCloseRef.current = requestClose;
  });

  useEffect(() => {
    if (!itemId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!window.history.state || window.history.state.marhabaDish !== itemId) {
      window.history.pushState({ marhabaDish: itemId }, "");
    }
    closeRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute("disabled"));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function onPop() {
      onCloseRef.current();
    }

    document.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onPop);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
      previousFocus?.focus();
    };
  }, [itemId]);

  if (!item) return null;

  const name = localizedName(lang, item.name_ru, item.name_en);
  const description = localizedName(lang, item.description_ru, item.description_en);
  const serving = localizedName(lang, item.serving_ru, item.serving_en);
  const lines = publicPriceLines(item.item_price_options, lang);
  const photo = resolveDishPhoto(item);

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center md:items-center md:p-6">
      <div className="absolute inset-0 bg-wine/50 backdrop-blur-[2px]" onClick={requestClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sheet-in relative flex h-[92dvh] max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-ivory shadow-[0_24px_70px_rgba(28,25,23,0.22)] md:h-auto md:max-h-[min(88dvh,820px)] md:max-w-5xl md:flex-row md:rounded-[28px] md:bg-paper"
      >
        <div className={`relative shrink-0 overflow-hidden ${photo ? "h-[44%] min-h-52 md:h-auto md:min-h-[520px] md:w-[48%]" : "h-24 md:h-auto md:w-[30%]"}`}>
          {photo ? (
            <img
              src={photo.detail}
              alt=""
              width={1600}
              height={1200}
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="photo-fallback absolute inset-0" />
          )}
          <button
            ref={closeRef}
            type="button"
            onClick={requestClose}
            aria-label={t.close}
            className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 grid h-11 w-11 place-items-center rounded-full bg-paper/95 text-burgundy shadow-md md:top-4"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:px-8 md:py-8">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-burgundy uppercase">
            {t.category}
            {categoryName ? ` · ${categoryName}` : ""}
          </p>
          <h2 id={titleId} className="mt-2 font-serif text-[2.15rem] leading-[0.95] break-words text-ink sm:text-5xl">
            {name}
          </h2>
          {item.is_featured ? (
            <p className="mt-3 inline-flex rounded-full bg-burgundy px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] text-ivory uppercase">
              {t.featured}
            </p>
          ) : null}
          <div className="mt-5 rounded-[20px] border border-burgundy/15 bg-paper px-4 py-4">
            <div className="flex flex-col gap-1.5">
              {lines.map((line) => (
                <p key={line} className="text-xl leading-snug font-bold break-words text-ink tabular-nums sm:text-2xl">
                  {line}
                </p>
              ))}
            </div>
            {serving ? <p className="mt-2 text-sm text-muted">{t.weight}: {serving}</p> : null}
          </div>
          {description ? <p className="mt-5 text-base leading-relaxed text-ink">{description}</p> : null}
          {photo?.attribution || photo?.license ? (
            <p className="mt-8 text-[11px] leading-relaxed text-muted">
              {t.photoCredit}: {photo.attribution || t.bundledNote}
              {photo.license ? ` · ${photo.license}` : ""}
              {photo.sourceUrl ? (
                <>
                  {" · "}
                  <a href={photo.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {t.photoSource}
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
