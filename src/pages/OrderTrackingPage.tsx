import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui";
import { fetchGuestOrders, OrderError, trackOrder } from "../features/orders/api";
import { useVisit } from "../features/orders/visit-context";
import type { OrderStatus } from "../features/orders/policy";
import { formatTableNumber } from "../features/qr/url";
import { useLanguage } from "../i18n/language";
import { formatPrice, localizedName, moneySuffix } from "../utils/format";

export function OrderTrackingPage() {
  const { token = "" } = useParams();
  const { lang, t } = useLanguage();
  const navigate = useNavigate();
  const { visit, finishVisit } = useVisit();
  const order = useQuery({
    queryKey: ["guest-order", token, visit?.sessionId ?? ""],
    enabled: /^[0-9a-f]{64}$/i.test(token),
    queryFn: () => trackOrder(token),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || status === "served" || status === "cancelled") return false;
      return 4000;
    },
  });
  const missing = !/^[0-9a-f]{64}$/i.test(token) || (order.isError && order.error instanceof OrderError && order.error.code === "NOT_FOUND");

  if (order.isLoading) {
    return <main className="grid min-h-dvh place-items-center text-sm text-muted">{t.loading}</main>;
  }
  if (missing || !order.data) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-6 text-center">
        <div>
          <h1 className="font-serif text-4xl text-ink">{t.trackMissing}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">{t.trackMissingHint}</p>
          <p className="mt-3 text-sm text-muted">{t.lostAccess}</p>
          <Link to="/" className="mt-5 inline-flex"><Button>{t.backToMenu}</Button></Link>
        </div>
      </main>
    );
  }

  const data = order.data;
  const terminal = data.status === "served" || data.status === "cancelled";

  async function acknowledge() {
    const notice = {
      publicNumber: data.publicOrderNumber,
      status: data.status === "cancelled" ? "cancelled" as const : "served" as const,
      reason: data.cancellationReason,
    };
    if (visit?.secret) {
      const board = await fetchGuestOrders(visit.secret).catch(() => null);
      if (!board) {
        navigate("/my-orders", { replace: true });
        return;
      }
      const stillActive = board.active.filter((item) => item.publicOrderNumber !== data.publicOrderNumber);
      if (stillActive.length > 0) {
        const next = stillActive.find((item) => item.trackingToken)?.trackingToken;
        navigate(next ? `/order/${next}` : "/my-orders", { replace: true });
        return;
      }
    }
    await finishVisit(notice);
    navigate("/", { replace: true });
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl px-4 py-6 pb-16">
      <Link to="/" className="text-sm font-medium text-burgundy">{t.backToMenu}</Link>
      <p className="mt-4 text-xs font-semibold tracking-[0.16em] text-burgundy uppercase">{t.placedTitle}</p>
      <h1 className="mt-2 font-serif text-5xl text-ink">#{data.publicOrderNumber}</h1>
      <p className="mt-2 text-sm text-muted">{t.tableBadge.replace("{n}", formatTableNumber(data.tableNumber))}</p>
      <p className="mt-4 rounded-[18px] bg-burgundy px-4 py-3 text-sm font-medium text-ivory">{statusLabel(data.status, t)}</p>
      {terminal ? (
        <div className="mt-4 rounded-[18px] border border-gold/40 bg-paper px-4 py-3 text-sm text-ink">
          <p>{data.status === "cancelled" ? t.orderCancelledBanner : t.orderServedBanner}</p>
          {data.cancellationReason ? <p className="mt-1 text-burgundy">{t.cancellationReason}: {data.cancellationReason}</p> : null}
          <button
            type="button"
            className="mt-3 text-sm font-semibold text-burgundy"
            onClick={() => void acknowledge()}
          >
            {t.doneAck}
          </button>
        </div>
      ) : null}
      {data.status === "cancelled" ? null : <OrderProgress status={data.status} labels={[t.stepNew, t.stepAccepted, t.stepPreparing, t.stepReady, t.stepServed]} />}
      {!terminal ? <p className="mt-2 text-xs text-muted">{t.liveUpdating}</p> : null}
      {data.prepEstimateMinutes ? <p className="mt-3 text-sm text-ink">{t.prepEstimate}: {data.prepEstimateMinutes} {t.minutesShort}</p> : null}
      {data.cancellationReason ? <p className="mt-3 text-sm text-burgundy">{t.cancellationReason}: {data.cancellationReason}</p> : null}
      <p className="mt-3 text-sm text-muted">{t.paymentPending}</p>
      <section className="mt-6 space-y-3">
        {data.items.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-3 rounded-[20px] border border-line bg-paper px-4 py-3">
            <div>
              <p className="font-medium">{item.quantity} × {localizedName(lang, item.nameRu, item.nameEn)}</p>
              {localizedName(lang, item.variantRu, item.variantEn) ? <p className="text-sm text-muted">{localizedName(lang, item.variantRu, item.variantEn)}</p> : null}
              {item.note ? <p className="text-sm text-muted">{item.note}</p> : null}
            </div>
            <p className="font-semibold tabular-nums">{formatPrice(item.lineTotal)} {moneySuffix(lang)}</p>
          </div>
        ))}
      </section>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-muted">{t.cartTotal}</span>
        <span className="font-serif text-3xl tabular-nums">{formatPrice(data.totalAmount)} {moneySuffix(lang)}</span>
      </div>
      <section className="mt-8">
        <h2 className="font-serif text-2xl text-ink">{t.timeline}</h2>
        <ol className="mt-4 space-y-3">
          {data.timeline.map((event) => (
            <li key={event.id} className="rounded-[18px] border border-line bg-paper px-4 py-3">
              <p className="font-medium">{statusLabel(event.status, t)}</p>
              <p className="text-xs text-muted">{new Date(event.createdAt).toLocaleString(lang === "ru" ? "ru-RU" : "en-GB")}{event.actorName ? ` · ${event.actorName}` : ""}</p>
              {event.reason ? <p className="mt-1 text-sm text-burgundy">{event.reason}</p> : null}
            </li>
          ))}
        </ol>
      </section>
      <Link to="/my-orders" className="mt-6 inline-flex text-sm font-medium text-burgundy">{t.myOrders}</Link>
    </main>
  );
}

function OrderProgress({ status, labels }: { status: OrderStatus; labels: string[] }) {
  const order = ["pending", "accepted", "preparing", "ready", "served"];
  const current = status === "serving" ? 3 : Math.max(0, order.indexOf(status));
  return (
    <ol className="mt-4 grid grid-cols-5 gap-2">
      {labels.map((label, index) => {
        const done = index <= current;
        return (
          <li key={label} className="text-center">
            <span className={`mx-auto block h-2 rounded-full ${done ? "bg-burgundy" : "bg-line"}`} />
            <span className={`mt-2 block text-[11px] leading-tight ${done ? "text-ink" : "text-muted"}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function statusLabel(status: OrderStatus, t: {
  statusPending: string;
  statusAccepted: string;
  statusPreparing: string;
  statusReady: string;
  statusServing: string;
  statusServed: string;
  statusCancelled: string;
}) {
  return {
    pending: t.statusPending,
    accepted: t.statusAccepted,
    preparing: t.statusPreparing,
    ready: t.statusReady,
    serving: t.statusServing,
    served: t.statusServed,
    cancelled: t.statusCancelled,
  }[status];
}
