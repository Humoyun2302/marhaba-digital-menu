import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "../components/ui";
import { fetchGuestOrders } from "../features/orders/api";
import { useVisit } from "../features/orders/visit-context";
import { formatTableNumber } from "../features/qr/url";
import { useLanguage } from "../i18n/language";

export function MyOrdersPage() {
  const { t } = useLanguage();
  const { visit, notice, finishVisit, dismissNotice } = useVisit();
  const orders = useQuery({
    queryKey: ["guest-orders", visit?.sessionId ?? ""],
    enabled: Boolean(visit?.secret),
    queryFn: () => fetchGuestOrders(visit?.secret ?? ""),
    refetchInterval: 4000,
  });
  const active = orders.data?.active ?? [];
  const recent = orders.data?.recent ?? [];

  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl px-4 py-6">
      <Link to="/" className="text-sm font-medium text-burgundy">{t.backToMenu}</Link>
      <h1 className="mt-3 font-serif text-4xl text-ink">{t.myOrders}</h1>
      {visit ? (
        <p className="mt-3 inline-flex rounded-full bg-burgundy px-3 py-1 text-xs font-semibold tracking-[0.14em] text-ivory uppercase">
          {t.tableBadge.replace("{n}", formatTableNumber(visit.tableNumber))}
        </p>
      ) : null}
      <p className="mt-3 text-sm leading-relaxed text-muted">{t.deviceOrders}</p>
      {notice ? (
        <div className="mt-4 rounded-[18px] border border-gold/40 bg-paper px-4 py-3 text-sm text-ink">
          <p>{notice.status === "cancelled" ? t.orderCancelledBanner : t.orderServedBanner} #{notice.publicNumber}</p>
          <button type="button" onClick={dismissNotice} className="mt-2 text-xs font-semibold text-burgundy uppercase">{t.doneAck}</button>
        </div>
      ) : null}
      {!visit || (active.length === 0 && recent.length === 0) ? <p className="mt-8 text-sm text-muted">{t.noActiveOrders}</p> : null}
      <div className="mt-5 space-y-3">
        {active.map((order) => (
          <Link key={order.id} to={`/order/${order.trackingToken}`} className="block rounded-[22px] border border-line bg-paper px-4 py-4 shadow-[var(--shadow-soft)]">
            <p className="font-serif text-2xl text-ink">#{order.publicOrderNumber}</p>
            <p className="text-sm text-muted">{t.tableBadge.replace("{n}", formatTableNumber(order.tableNumber))}</p>
            <p className="mt-2 text-sm font-medium text-burgundy">{statusText(order.status, t)}</p>
          </Link>
        ))}
        {recent.map((order) => (
          <div key={order.id} className="rounded-[22px] border border-line bg-paper px-4 py-4">
            <p className="font-serif text-2xl text-ink">#{order.publicOrderNumber}</p>
            <p className="mt-2 text-sm text-ink">{order.status === "cancelled" ? t.orderCancelledBanner : t.orderServedBanner}</p>
            {order.cancellationReason ? <p className="mt-1 text-sm text-burgundy">{t.cancellationReason}: {order.cancellationReason}</p> : null}
            {active.length === 0 ? (
              <button
                type="button"
                className="mt-3 text-sm font-semibold text-burgundy"
                onClick={() => void finishVisit({
                  publicNumber: order.publicOrderNumber,
                  status: order.status === "cancelled" ? "cancelled" : "served",
                  reason: order.cancellationReason,
                })}
              >
                {t.doneAck}
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <Link to="/" className="mt-6 inline-flex"><Button variant="secondary">{t.backToMenu}</Button></Link>
    </main>
  );
}

function statusText(status: string, t: {
  statusPending: string;
  statusAccepted: string;
  statusPreparing: string;
  statusReady: string;
  statusServing: string;
  statusServed: string;
  statusCancelled: string;
}) {
  const labels: Record<string, string> = {
    pending: t.statusPending,
    accepted: t.statusAccepted,
    preparing: t.statusPreparing,
    ready: t.statusReady,
    serving: t.statusServing,
    served: t.statusServed,
    cancelled: t.statusCancelled,
  };
  return labels[status] ?? status;
}
