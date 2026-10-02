import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui";
import { useLanguage } from "../../i18n/language";
import { formatPrice, moneySuffix } from "../../utils/format";
import { fetchPublicMenu } from "../menu/api";
import { useCart } from "./cart-context";
import { payableTotal, resolveCart } from "./policy";

export function CartButton({ onClick }: { onClick: () => void }) {
  const { lang, t } = useLanguage();
  const cart = useCart();
  const menu = useQuery({ queryKey: ["public-menu"], queryFn: fetchPublicMenu });
  if (!cart.count) return null;
  const total = payableTotal(resolveCart(cart.lines, menu.data ?? [], lang));
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t.viewCart}
      data-cart-count={cart.count}
      className="fixed right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-burgundy px-4 text-sm font-semibold text-ivory shadow-[0_12px_30px_rgba(77,17,24,0.28)]"
      style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <ShoppingBag size={18} />
      <span className="tabular-nums">{cart.count}</span>
      <span className="tabular-nums">{formatPrice(total)} {moneySuffix(lang)}</span>
    </button>
  );
}

export function CartSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang, t } = useLanguage();
  const cart = useCart();
  const menu = useQuery({ queryKey: ["public-menu"], queryFn: fetchPublicMenu });
  if (!open) return null;
  const resolved = resolveCart(cart.lines, menu.data ?? [], lang);
  const total = payableTotal(resolved);
  const blocked = resolved.some((line) => line.issue !== "ok");

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col" style={{ top: "var(--sticky-offset, 8.5rem)" }}>
      <button type="button" aria-label={t.closeCart} className="absolute inset-0 bg-wine/25" onClick={onClose} />
      <div className="cart-sheet relative mt-auto flex max-h-full min-h-0 flex-col rounded-t-[28px] border border-line bg-ivory shadow-[0_-12px_40px_rgba(77,17,24,0.12)]">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="font-serif text-3xl text-ink">{t.cartTitle}</h2>
          <button type="button" aria-label={t.close} onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full text-burgundy">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
          {resolved.length === 0 ? <p className="py-8 text-center text-sm text-muted">{t.cartEmpty}</p> : null}
          {resolved.map((line, index) => (
            <article key={`${line.itemId}:${line.optionId}:${index}`} className="rounded-[20px] border border-line bg-paper p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{line.name || t.unavailableNow}</p>
                  {line.variant ? <p className="text-sm text-muted">{line.variant}</p> : null}
                  {line.issue !== "ok" ? <p className="mt-1 text-xs text-burgundy">{line.issue === "variant" ? t.variantRequired : t.unavailableNow}</p> : (
                    <p className="mt-1 text-sm font-semibold tabular-nums">{formatPrice(line.lineTotal)} {moneySuffix(lang)}</p>
                  )}
                </div>
                <button type="button" aria-label={t.removeFromCart} onClick={() => cart.remove(line.itemId, line.optionId, line.note)} className="text-xs font-semibold text-burgundy">
                  {t.removeFromCart}
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button type="button" aria-label={t.decreaseQty} onClick={() => cart.setQuantity(line.itemId, line.optionId, line.note, line.quantity - 1)} className="grid h-10 w-10 place-items-center rounded-full border border-line">
                  <Minus size={16} />
                </button>
                <span className="w-8 text-center font-semibold tabular-nums">{line.quantity}</span>
                <button type="button" aria-label={t.increaseQty} onClick={() => cart.setQuantity(line.itemId, line.optionId, line.note, line.quantity + 1)} className="grid h-10 w-10 place-items-center rounded-full border border-line">
                  <Plus size={16} />
                </button>
              </div>
              <label className="mt-3 block text-xs text-muted">
                {t.itemNote}
                <input
                  value={line.note}
                  maxLength={200}
                  onChange={(event) => cart.setNote(line.itemId, line.optionId, line.note, event.target.value)}
                  className="mt-1 h-11 w-full rounded-[14px] border border-line bg-ivory px-3 text-sm text-ink outline-none"
                />
              </label>
            </article>
          ))}
        </div>
        <div className="border-t border-line bg-paper px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-muted">{t.cartTotal}</span>
            <span className="font-serif text-2xl tabular-nums text-ink">{formatPrice(total)} {moneySuffix(lang)}</span>
          </div>
          <Link to="/checkout" onClick={onClose} className={blocked || resolved.length === 0 ? "pointer-events-none" : ""}>
            <Button className="w-full" disabled={blocked || resolved.length === 0}>
              <ShoppingBag size={16} />
              {t.checkout}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
