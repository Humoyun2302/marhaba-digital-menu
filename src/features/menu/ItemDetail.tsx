import { Minus, Plus, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "../../i18n/language";
import type { MenuItem } from "../../types/menu";
import { localizedName, publicPriceLines } from "../../utils/format";
import { useCart } from "../orders/cart-context";
import { resolveDishPhoto } from "./photos";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

type ItemDetailProps = {
  item: MenuItem | null;
  categoryName: string;
  onClose: () => void;
};

export function ItemDetail({ item, categoryName, onClose }: ItemDetailProps) {
  const { lang, t } = useLanguage();
  const cart = useCart();
  const titleId = useId();
  const itemId = item?.id ?? null;
  const [optionId, setOptionId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [draftItemId, setDraftItemId] = useState<string | null>(null);
  if (itemId !== draftItemId) {
    setDraftItemId(itemId);
    const options = item?.item_price_options ?? [];
    setOptionId(options.length === 1 ? (options[0]?.id ?? null) : null);
    setQuantity(1);
    setNote("");
  }
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

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
        className="relative flex h-[92dvh] max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-ivory shadow-[0_24px_70px_rgba(28,25,23,0.22)] md:h-auto md:max-h-[min(88dvh,820px)] md:max-w-5xl md:flex-row md:rounded-[28px] md:bg-paper"
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
          {item.item_price_options.length > 1 ? (
            <fieldset className="mt-5 space-y-2">
              <legend className="text-sm font-medium text-ink">{t.variantRequired}</legend>
              {item.item_price_options.map((option) => (
                <label key={option.id} className="flex items-center justify-between gap-3 rounded-[16px] border border-line bg-paper px-3 py-3 text-sm">
                  <span className="flex items-center gap-2">
                    <input type="radio" name="variant" checked={optionId === option.id} onChange={() => setOptionId(option.id)} />
                    {localizedName(lang, option.label_ru, option.label_en) || t.price}
                  </span>
                  <span className="font-semibold tabular-nums">{publicPriceLines([option], lang)[0]}</span>
                </label>
              ))}
            </fieldset>
          ) : null}
          {item.item_price_options.length > 0 ? (
            <div className="mt-5">
              <label className="block text-sm text-muted">
                {t.itemNote}
                <input value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} className="mt-1 h-12 w-full rounded-[16px] border border-line bg-paper px-3 text-base text-ink outline-none" />
              </label>
              <div className="mt-3 flex items-center gap-3">
                <button type="button" aria-label={t.decreaseQty} onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="grid h-11 w-11 place-items-center rounded-full border border-line bg-paper"><Minus size={16} /></button>
                <span className="w-8 text-center font-semibold tabular-nums">{quantity}</span>
                <button type="button" aria-label={t.increaseQty} onClick={() => setQuantity((value) => Math.min(20, value + 1))} className="grid h-11 w-11 place-items-center rounded-full border border-line bg-paper"><Plus size={16} /></button>
                <button
                  type="button"
                  disabled={!optionId}
                  onClick={() => {
                    if (!optionId) return;
                    cart.add({ itemId: item.id, optionId, quantity, note });
                    requestClose();
                  }}
                  className="ml-auto h-12 rounded-full bg-burgundy px-5 text-sm font-semibold text-ivory disabled:opacity-50"
                >
                  {t.addToCart}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
