import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Field, TextArea, TextInput } from "../components/ui";
import { useCart } from "../features/orders/cart-context";
import { createOrder, fetchOrderingStatus, OrderError } from "../features/orders/api";
import { payableTotal, resolveCart } from "../features/orders/policy";
import { checkoutKey, clearCheckoutKey } from "../features/orders/storage";
import { useVisit } from "../features/orders/visit-context";
import { fetchPublicMenu } from "../features/menu/api";
import { formatTableNumber } from "../features/qr/url";
import { useLanguage } from "../i18n/language";
import { queryClient } from "../lib/queryClient";
import { formatPrice, moneySuffix } from "../utils/format";

export function CheckoutPage() {
  const { lang, t } = useLanguage();
  const navigate = useNavigate();
  const cart = useCart();
  const { visit } = useVisit();
  const menu = useQuery({ queryKey: ["public-menu"], queryFn: fetchPublicMenu });
  const ordering = useQuery({ queryKey: ["ordering-status"], queryFn: fetchOrderingStatus });
  const table = visit;
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [allergy, setAllergy] = useState("");
  const [error, setError] = useState("");
  const [priceChanged, setPriceChanged] = useState(false);
  const [acceptedTotal, setAcceptedTotal] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  const resolved = resolveCart(cart.lines, menu.data ?? [], lang);
  const ready = resolved.filter((line) => line.issue === "ok");
  const total = payableTotal(resolved);
  const blocked = !table || ready.length === 0 || resolved.some((line) => line.issue !== "ok") || ordering.data?.accepting === false;
  const closed = closedCopy(ordering.data?.closedReason, t);

  async function submit() {
    if (lock.current || !table || blocked) return;
    lock.current = true;
    setSubmitting(true);
    setError("");
    try {
      const fresh = await queryClient.fetchQuery({ queryKey: ["public-menu"], queryFn: fetchPublicMenu, staleTime: 0 });
      const next = resolveCart(cart.lines, fresh, lang);
      const nextTotal = payableTotal(next);
      if (next.some((line) => line.issue !== "ok")) {
        setError(t.unavailableNow);
        return;
      }
      if (nextTotal !== total && acceptedTotal !== nextTotal) {
        setAcceptedTotal(nextTotal);
        setPriceChanged(true);
        return;
      }
      const signature = next.map((line) => `${line.itemId}:${line.optionId}:${line.quantity}:${line.note}:${line.unitPrice}`).join("|");
      const result = await createOrder({
        tableToken: table.token,
        idempotencyKey: checkoutKey(table.sessionId, signature),
        customerName: name,
        specialInstructions: note,
        allergyNotes: allergy,
        sessionSecret: table.secret,
        expectedTotal: nextTotal,
        items: next.map((line) => ({
          menuItemId: line.itemId,
          priceOptionId: line.optionId,
          quantity: line.quantity,
          note: line.note,
        })),
      });
      clearCheckoutKey(table.sessionId);
      cart.clear();
      navigate(`/order/${result.trackingToken}`, { replace: true });
    } catch (reason) {
      const code = reason instanceof OrderError ? reason.code : "ORDER_FAILED";
      if (code === "PRICE_CHANGED") {
        const fresh = await queryClient.fetchQuery({ queryKey: ["public-menu"], queryFn: fetchPublicMenu, staleTime: 0 });
        const nextTotal = payableTotal(resolveCart(cart.lines, fresh, lang));
        setAcceptedTotal(nextTotal);
        setPriceChanged(true);
      }
      setError(errorCopy(code, t));
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl px-4 py-6 pb-16">
      <Link to="/" className="text-sm font-medium text-burgundy">{t.backToMenu}</Link>
      <h1 className="mt-3 font-serif text-4xl text-ink">{t.checkoutTitle}</h1>
      <p className="mt-3 rounded-[18px] border border-gold/40 bg-paper px-4 py-3 text-sm leading-relaxed text-ink">{t.paymentNotice}</p>
      {table ? (
        <p className="mt-4 inline-flex rounded-full bg-burgundy px-3 py-1 text-xs font-semibold tracking-[0.14em] text-ivory uppercase">
          {t.tableBadge.replace("{n}", formatTableNumber(table.tableNumber))}
        </p>
      ) : (
        <p className="mt-4 rounded-[18px] border border-line bg-paper px-4 py-3 text-sm text-burgundy">{t.noTableText}</p>
      )}
      {closed ? <p className="mt-3 text-sm text-burgundy">{closed}</p> : null}
      {priceChanged ? <p className="mt-3 text-sm text-burgundy">{t.priceUpdated}</p> : null}
      <div className="mt-5 space-y-3">
        {ready.map((line) => (
          <div key={`${line.itemId}:${line.optionId}:${line.note}`} className="flex items-start justify-between gap-3 rounded-[20px] border border-line bg-paper px-4 py-3">
            <div>
              <p className="font-medium">{line.quantity} × {line.name}</p>
              {line.variant ? <p className="text-sm text-muted">{line.variant}</p> : null}
              {line.note ? <p className="text-sm text-muted">{line.note}</p> : null}
            </div>
            <p className="shrink-0 font-semibold tabular-nums">{formatPrice(line.lineTotal)} {moneySuffix(lang)}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-muted">{t.cartTotal}</span>
        <span className="font-serif text-3xl tabular-nums">{formatPrice(total)} {moneySuffix(lang)}</span>
      </div>
      <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <Field label={`${t.customerName} · ${t.optional}`}>
          <TextInput value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label={`${t.orderNote} · ${t.optional}`}>
          <TextArea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <Field label={`${t.allergyNote} · ${t.optional}`}>
          <TextArea value={allergy} maxLength={500} onChange={(event) => setAllergy(event.target.value)} />
        </Field>
        {error ? <p className="text-sm text-burgundy">{error}</p> : null}
        <Button type="submit" className="w-full" loading={submitting} disabled={blocked}>
          {submitting ? t.confirming : priceChanged ? t.confirmNewTotal : t.confirmOrder}
        </Button>
      </form>
    </main>
  );
}

function closedCopy(reason: string | null | undefined, t: { orderingOff: string; orderingPaused: string; orderingHours: string; orderingSetup: string }) {
  if (reason === "ORDERING_DISABLED") return t.orderingOff;
  if (reason === "ORDERS_PAUSED") return t.orderingPaused;
  if (reason === "OUTSIDE_HOURS") return t.orderingHours;
  if (reason === "UNAVAILABLE") return t.orderingSetup;
  return "";
}

function errorCopy(code: string, t: { orderFailed: string; rateLimited: string; noTableText: string; unavailableNow: string; variantRequired: string; orderingOff: string; orderingPaused: string; orderingHours: string; orderingSetup: string; sessionEnded: string; tableReleased: string; priceUpdated: string }) {
  if (code === "RATE_LIMIT") return t.rateLimited;
  if (code === "INVALID_TABLE" || code === "SESSION_TABLE_MISMATCH") return t.noTableText;
  if (code === "ITEM_UNAVAILABLE") return t.unavailableNow;
  if (code === "VARIANT_REQUIRED") return t.variantRequired;
  if (code === "ORDERING_DISABLED") return t.orderingOff;
  if (code === "ORDERS_PAUSED") return t.orderingPaused;
  if (code === "OUTSIDE_HOURS") return t.orderingHours;
  if (code === "UNAVAILABLE" || code === "FUNCTION_MISSING") return t.orderingSetup;
  if (code === "PRICE_CHANGED") return t.priceUpdated;
  if (code === "SESSION_REVOKED") return t.tableReleased;
  if (code === "SESSION_INVALID" || code === "SESSION_EXPIRED") return t.sessionEnded;
  return t.orderFailed;
}
