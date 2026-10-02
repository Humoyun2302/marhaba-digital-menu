import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AdminPageHeader, Button, Field, Switch, TextInput } from "../../components/ui";
import { useToast } from "../../components/toast-context";
import { fetchBotHealth, OrderError, retryNotifications, sendTestNotification, transitionOrder, type BotHealth } from "../../features/orders/api";
import { canCancel, forwardActions, type OrderStatus } from "../../features/orders/policy";
import { requireSupabase } from "../../lib/supabase";
import { useLanguage } from "../../i18n/language";
import { formatPrice, localizedName, moneySuffix } from "../../utils/format";

type OrderRow = {
  id: string;
  public_order_number: number;
  table_number: number;
  order_status: OrderStatus;
  customer_name: string | null;
  special_instructions: string | null;
  allergy_notes: string | null;
  total_amount: number;
  attention_required: boolean;
  cancellation_reason: string | null;
  created_at: string;
  restaurant_order_items: Array<{
    id: string;
    menu_item_name_snapshot: string;
    menu_item_name_en_snapshot: string | null;
    selected_variant_snapshot: { label_ru?: string | null; label_en?: string | null } | null;
    quantity: number;
    line_total: number;
  }>;
};

type SettingsRow = {
  singleton: boolean;
  ordering_enabled: boolean;
  orders_paused: boolean;
  orders_chat_id: number | null;
};

type Bucket = "new" | "active" | "done" | "cancelled";

function missingSchema(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return /restaurant_orders|schema cache|does not exist|PGRST202|PGRST205/i.test(message);
}

function inBucket(status: OrderStatus, bucket: Bucket): boolean {
  if (bucket === "new") return status === "pending";
  if (bucket === "active") return status === "accepted" || status === "preparing" || status === "ready" || status === "serving";
  if (bucket === "done") return status === "served";
  return status === "cancelled";
}

export function OrdersPage() {
  const { lang, t } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"list" | "settings">("list");
  const [bucket, setBucket] = useState<Bucket>("new");
  const [table, setTable] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [guestLink, setGuestLink] = useState("");

  const orders = useQuery({
    queryKey: ["admin-orders"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("restaurant_orders")
        .select(`id, public_order_number, table_number, order_status, customer_name, special_instructions, allergy_notes, total_amount, attention_required, cancellation_reason, created_at, restaurant_order_items (id, menu_item_name_snapshot, menu_item_name_en_snapshot, selected_variant_snapshot, quantity, line_total)`)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as OrderRow[];
    },
  });

  if (missingSchema(orders.error)) {
    return (
      <div>
        <AdminPageHeader title={t.orders} description={t.ordersSubtitle} />
        <p className="mt-6 rounded-[22px] border border-line bg-paper p-5 text-sm leading-relaxed text-ink">{t.migrationOrders}</p>
      </div>
    );
  }

  const counts = {
    new: (orders.data ?? []).filter((order) => inBucket(order.order_status, "new")).length,
    active: (orders.data ?? []).filter((order) => inBucket(order.order_status, "active")).length,
    done: (orders.data ?? []).filter((order) => inBucket(order.order_status, "done")).length,
    cancelled: (orders.data ?? []).filter((order) => inBucket(order.order_status, "cancelled")).length,
  };
  const filtered = (orders.data ?? []).filter((order) => {
    if (!inBucket(order.order_status, bucket)) return false;
    if (table && order.table_number !== Number(table)) return false;
    return true;
  });
  const current = filtered.find((order) => order.id === selected) ?? filtered[0] ?? null;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
  }

  const move = useMutation({
    mutationFn: (input: { orderId: string; toStatus: OrderStatus; reason?: string }) => transitionOrder(input),
    onSuccess: async () => {
      toast.push("success", t.transitionSaved);
      await refresh();
    },
    onError: (error) => toast.push("error", error instanceof OrderError ? error.code : t.saveError),
  });

  const buckets: Array<{ id: Bucket; label: string; count: number }> = [
    { id: "new", label: t.bucketNew, count: counts.new },
    { id: "active", label: t.bucketActive, count: counts.active },
    { id: "done", label: t.bucketDone, count: counts.done },
    { id: "cancelled", label: t.bucketCancelled, count: counts.cancelled },
  ];

  return (
    <div>
      <AdminPageHeader title={t.orders} description={t.ordersSubtitle} />
      <div className="mt-5 flex gap-2 overflow-x-auto">
        {(["list", "settings"] as const).map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={`h-11 shrink-0 rounded-full px-4 text-sm ${tab === item ? "bg-burgundy text-ivory" : "bg-paper text-ink"}`}>
            {item === "list" ? t.ordersTab : t.settingsTab}
          </button>
        ))}
      </div>
      {tab === "settings" ? <SettingsPanel /> : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
          <div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {buckets.map((item) => (
                <button key={item.id} type="button" onClick={() => setBucket(item.id)} className={`rounded-[18px] border px-3 py-3 text-left ${bucket === item.id ? "border-burgundy bg-burgundy/5" : "border-line bg-paper"}`}>
                  <p className="text-xs text-muted">{item.label}</p>
                  <p className="font-serif text-3xl text-ink">{item.count}</p>
                </button>
              ))}
            </div>
            <TextInput className="mt-3" value={table} onChange={(event) => setTable(event.target.value.replace(/\D/g, "").slice(0, 3))} placeholder={t.filterTable} aria-label={t.filterTable} />
            <div className="mt-3 space-y-2">
              {filtered.length === 0 ? <p className="text-sm text-muted">{t.noOrders}</p> : null}
              {filtered.map((order) => (
                <button key={order.id} type="button" onClick={() => { setSelected(order.id); setGuestLink(""); }} className={`w-full rounded-[20px] border px-4 py-3 text-left ${current?.id === order.id ? "border-burgundy bg-burgundy/5" : "border-line bg-paper"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-serif text-2xl">#{order.public_order_number}</p>
                    <span className="text-xs font-semibold text-burgundy">{label(order.order_status, t)}</span>
                  </div>
                  <p className="text-sm text-muted">{t.tableBadge.replace("{n}", String(order.table_number))} · {formatPrice(order.total_amount)} {moneySuffix(lang)}</p>
                  {order.attention_required ? <p className="mt-1 text-xs text-burgundy">{t.attention}</p> : null}
                </button>
              ))}
            </div>
          </div>
          {current ? (
            <aside className="rounded-[24px] border border-line bg-paper p-4 shadow-[var(--shadow-soft)]">
              <p className="font-serif text-3xl">#{current.public_order_number}</p>
              <p className="mt-1 text-sm text-muted">{t.tableBadge.replace("{n}", String(current.table_number))}</p>
              <p className="mt-3 rounded-[16px] bg-burgundy px-3 py-2 text-sm font-medium text-ivory">{label(current.order_status, t)}</p>
              {current.special_instructions ? <p className="mt-3 text-sm">{t.orderNote}: {current.special_instructions}</p> : null}
              {current.cancellation_reason ? <p className="mt-2 text-sm text-burgundy">{t.cancellationReason}: {current.cancellation_reason}</p> : null}
              <h3 className="mt-4 text-sm font-semibold">{t.orderContents}</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {current.restaurant_order_items.map((item) => (
                  <li key={item.id}>
                    {item.quantity} × {localizedName(lang, item.menu_item_name_snapshot, item.menu_item_name_en_snapshot)}
                    {localizedName(lang, item.selected_variant_snapshot?.label_ru, item.selected_variant_snapshot?.label_en) ? ` · ${localizedName(lang, item.selected_variant_snapshot?.label_ru, item.selected_variant_snapshot?.label_en)}` : ""}
                    <span className="text-muted"> · {formatPrice(item.line_total)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 font-serif text-2xl tabular-nums">{formatPrice(current.total_amount)} {moneySuffix(lang)}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {forwardActions(current.order_status).map((next) => (
                  <Button key={next} size="sm" loading={move.isPending} onClick={() => move.mutate({ orderId: current.id, toStatus: next })}>
                    {actionLabel(next, t)}
                  </Button>
                ))}
                {canCancel(current.order_status) ? (
                  <Button variant="danger" size="sm" loading={move.isPending} onClick={() => move.mutate({ orderId: current.id, toStatus: "cancelled", reason: "Отменено" })}>
                    {t.cancelOrder}
                  </Button>
                ) : null}
              </div>
              <Button className="mt-3" size="sm" variant="secondary" onClick={async () => {
                const { data, error } = await requireSupabase().rpc("admin_reissue_tracking", { p_order_id: current.id });
                if (error || !data) {
                  toast.push("error", t.saveError);
                  return;
                }
                const token = (data as { tracking_token: string }).tracking_token;
                setGuestLink(`${window.location.origin}/order/${token}`);
              }}>
                {t.reissueAccess}
              </Button>
              {guestLink ? <button type="button" className="mt-2 text-left text-xs break-all text-burgundy" onClick={() => void navigator.clipboard.writeText(guestLink)}>{guestLink}</button> : null}
            </aside>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SettingsPanel() {
  const { t } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["order-settings"],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("restaurant_order_settings").select("singleton, ordering_enabled, orders_paused, orders_chat_id").eq("singleton", true).maybeSingle();
      if (error) throw new Error(error.message);
      return data as SettingsRow | null;
    },
  });
  const health = useQuery({ queryKey: ["bot-health"], queryFn: fetchBotHealth, retry: false, enabled: false });
  const [draft, setDraft] = useState<SettingsRow | null>(null);
  const current = draft ?? settings.data;
  if (!current) return <p className="mt-4 text-sm text-muted">{t.loading}</p>;
  const form = draft ?? current;
  const accepting = form.ordering_enabled && !form.orders_paused;
  return (
    <form className="mt-4 max-w-xl space-y-4" onSubmit={async (event) => {
      event.preventDefault();
      const chat = form.orders_chat_id === null || form.orders_chat_id === undefined ? "" : String(form.orders_chat_id);
      if (chat && !/^-?\d+$/.test(chat)) {
        toast.push("error", t.invalidChat);
        return;
      }
      const { error } = await requireSupabase().from("restaurant_order_settings").update({
        ordering_enabled: accepting,
        orders_paused: false,
        orders_chat_id: chat ? Number(chat) : null,
      }).eq("singleton", true);
      if (error) toast.push("error", t.saveError);
      else {
        toast.push("success", t.saved);
        setDraft(null);
        await queryClient.invalidateQueries({ queryKey: ["order-settings"] });
        await queryClient.invalidateQueries({ queryKey: ["ordering-status"] });
      }
    }}>
      <Switch checked={accepting} onChange={(enabled) => setDraft({ ...form, ordering_enabled: enabled, orders_paused: false })} label={t.orderingEnabled} />
      <Field label={t.chatId} hint={t.chatIdHint}>
        <TextInput value={form.orders_chat_id ?? ""} onChange={(event) => setDraft({ ...form, orders_chat_id: event.target.value ? Number(event.target.value) : null })} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit">{t.save}</Button>
        <Button type="button" variant="secondary" onClick={() => void health.refetch()}>{t.checkBot}</Button>
        <Button type="button" variant="secondary" onClick={async () => {
          try {
            await sendTestNotification();
            toast.push("success", t.testSent);
          } catch (error) {
            toast.push("error", error instanceof OrderError && error.code === "TELEGRAM_CHAT_NOT_CONFIGURED" ? t.chatMissing : t.botOff);
          }
        }}>{t.testNotice}</Button>
        <Button type="button" variant="ghost" onClick={async () => {
          try {
            await retryNotifications();
            toast.push("success", t.saved);
            await queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
          } catch {
            toast.push("error", t.botOff);
          }
        }}>{t.retryFailed}</Button>
      </div>
      {health.data ? <Health health={health.data} /> : null}
      {health.error ? <p className="text-sm text-burgundy">{t.botOff}</p> : null}
    </form>
  );
}

function Health({ health }: { health: BotHealth }) {
  const { t } = useLanguage();
  const problem = !health.hasToken || !health.botOk || !health.hasChat || health.failedNotifications > 0 || Boolean(health.webhookLastError);
  return (
    <div className="rounded-[20px] border border-line bg-paper p-4 text-sm">
      {problem ? <p className="mb-2 text-burgundy">{t.botOff}</p> : null}
      <p>{health.hasToken ? t.tokenSet : t.tokenMissing}</p>
      <p>{health.hasSecret ? t.secretSet : t.secretMissing}</p>
      <p>{health.hasChat ? t.chatSet : t.chatMissing}{health.chatId ? ` · ${health.chatId}` : ""}</p>
      <p>{t.botUser}: {health.botOk ? `@${health.botUsername ?? ""}` : "—"}</p>
      <p>{t.webhookState}: {health.webhookUrl || "—"}</p>
      <p>{t.pendingNotices}: {health.pendingNotifications} · {t.failedNotices}: {health.failedNotifications}</p>
      {health.webhookLastError ? <p className="text-burgundy">{health.webhookLastError}</p> : null}
    </div>
  );
}

function label(status: OrderStatus, t: {
  statusPending: string;
  statusAccepted: string;
  statusPreparing: string;
  statusReady: string;
  statusServing: string;
  statusServed: string;
  statusCancelled: string;
  stepNew: string;
  stepAccepted: string;
  stepPreparing: string;
  stepReady: string;
  stepServed: string;
}) {
  return {
    pending: t.stepNew,
    accepted: t.stepAccepted,
    preparing: t.stepPreparing,
    ready: t.stepReady,
    serving: t.stepReady,
    served: t.stepServed,
    cancelled: t.statusCancelled,
  }[status];
}

function actionLabel(status: OrderStatus, t: { acceptOrder: string; startPreparing: string; markReady: string; markServed: string }) {
  if (status === "accepted") return t.acceptOrder;
  if (status === "preparing") return t.startPreparing;
  if (status === "ready") return t.markReady;
  return t.markServed;
}
