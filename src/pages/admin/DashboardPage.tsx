import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { EyeOff, FolderTree, LayoutGrid, UtensilsCrossed } from "lucide-react";
import { Cell, Pie, PieChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchActivity, fetchAdminMenu, fetchDashboard, type RecentDish } from "../../features/admin/api";
import { useLanguage } from "../../i18n/language";
import { errorText, formatPrice, localizedName } from "../../utils/format";

export function DashboardPage() {
  const { lang, t } = useLanguage();
  const stats = useQuery({ queryKey: ["admin-dashboard"], queryFn: fetchDashboard });
  const menu = useQuery({ queryKey: ["admin-menu"], queryFn: fetchAdminMenu });
  const activity = useQuery({ queryKey: ["admin-activity"], queryFn: fetchActivity });

  if (stats.isLoading || menu.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-lg bg-paper" />
        ))}
      </div>
    );
  }
  if (stats.isError) {
    return (
      <div className="rounded-xl border border-line bg-paper p-6">
        <p>{t.loadError}</p>
        <button type="button" onClick={() => void stats.refetch()} className="mt-4 h-11 rounded-md bg-burgundy px-4 text-sm text-ivory">
          {t.retry}
        </button>
        {import.meta.env.DEV ? <p className="mt-2 text-xs text-muted">{errorText(stats.error)}</p> : null}
      </div>
    );
  }

  const data = stats.data;
  if (!data) return null;
  const categories = menu.data ?? [];
  const byCategory = categories.map((category) => ({
    name: localizedName(lang, category.name_ru, category.name_en),
    items: category.menu_items.length,
    average: averagePrice(category.menu_items),
  }));
  const hidden = Math.max(0, data.total - data.available);
  const availability = [
    { name: t.available, value: data.available },
    { name: t.hidden, value: hidden },
  ];

  return (
    <div>
      <p className="text-sm text-muted">{lang === "ru" ? "Добро пожаловать" : "Welcome back"}</p>
      <h1 className="mt-1 font-serif text-4xl text-ink">{t.dashboard}</h1>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<UtensilsCrossed size={18} />} label={t.totalDishes} value={data.total} />
        <Stat icon={<LayoutGrid size={18} />} label={t.available} value={data.available} />
        <Stat icon={<EyeOff size={18} />} label={t.hidden} value={hidden} />
        <Stat icon={<FolderTree size={18} />} label={t.categoryCount} value={data.categories} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <ChartCard title={lang === "ru" ? "Блюда по категориям" : "Menu items by category"} className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byCategory}>
              <XAxis dataKey="name" tick={{ fill: "#746c64", fontSize: 11 }} interval={0} angle={-28} height={70} textAnchor="end" axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "#746c64", fontSize: 12 }} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="items" radius={[8, 8, 0, 0]} fill="#721f2a" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title={lang === "ru" ? "Доступность" : "Availability"}>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={availability} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={3} stroke="none">
                {availability.map((entry, index) => (
                  <Cell key={entry.name} fill={index === 0 ? "#721f2a" : "#e4d5c4"} />
                ))}
              </Pie>
              <Tooltip content={<ChartTip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 text-sm text-muted">
            <span>{t.available}: {data.available}</span>
            <span>{t.hidden}: {hidden}</span>
          </div>
        </ChartCard>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title={lang === "ru" ? "Средняя цена" : "Average price by category"}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byCategory} layout="vertical" margin={{ left: 12 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={110} tick={{ fill: "#746c64", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip money />} />
              <Bar dataKey="average" radius={[0, 8, 8, 0]} fill="#c6a15b" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <section className="rounded-xl border border-line bg-paper p-5 shadow-[var(--shadow-soft)]">
          <h2 className="font-serif text-2xl text-ink">{t.recent}</h2>
          {activity.data && activity.data.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {activity.data.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-3 border-b border-line pb-3 last:border-0">
                  <div>
                    <p className="font-medium">{entry.entity_name}</p>
                    <p className="text-sm text-muted">{actionLabel(entry.action, entry.entity_type, lang)}</p>
                  </div>
                  <time className="shrink-0 text-xs text-muted">{timeAgo(entry.created_at, lang)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="mt-4 space-y-3">
              {data.recent.length === 0 ? <p className="text-sm text-muted">{t.noRecent}</p> : null}
              {data.recent.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{localizedName(lang, item.name_ru, item.name_en)}</p>
                    <p className="text-sm text-muted">{categoryName(item, lang)}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs ${item.is_available ? "bg-burgundy/10 text-burgundy" : "bg-ivory text-muted"}`}>
                    {item.is_available ? t.available : t.hidden}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function averagePrice(items: { item_price_options: { price: number }[] }[]): number {
  const prices = items.flatMap((item) => item.item_price_options.map((option) => option.price));
  if (!prices.length) return 0;
  return Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length);
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-paper p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between text-burgundy">{icon}<span className="text-xs text-muted">{label}</span></div>
      <p className="mt-3 font-serif text-4xl text-ink">{value}</p>
    </div>
  );
}

function ChartCard({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-paper p-5 shadow-[var(--shadow-soft)] ${className}`}>
      <h2 className="mb-3 font-serif text-2xl text-ink">{title}</h2>
      {children}
    </section>
  );
}

function ChartTip({ active, payload, label, money }: { active?: boolean; payload?: { value: number; name?: string }[]; label?: string; money?: boolean }) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div className="rounded-md border border-line bg-paper px-3 py-2 text-sm shadow-sm">
      <p className="text-muted">{label || payload[0]?.name}</p>
      <p className="font-semibold text-ink">{money ? formatPrice(value) : value}</p>
    </div>
  );
}

function categoryName(item: RecentDish, lang: "ru" | "en"): string {
  const category = Array.isArray(item.categories) ? item.categories[0] : item.categories;
  return category ? localizedName(lang, category.name_ru, category.name_en) : "";
}

function actionLabel(action: string, entityType: string, lang: "ru" | "en"): string {
  const entity = entityType === "category" ? (lang === "ru" ? "категория" : "category") : lang === "ru" ? "блюдо" : "dish";
  const verbs: Record<string, [string, string]> = {
    created: ["создано", "created"],
    updated: ["обновлено", "updated"],
    deleted: ["удалено", "deleted"],
    hidden: ["скрыто", "hidden"],
    restored: ["возвращено", "restored"],
    reordered: ["порядок изменён", "reordered"],
  };
  const verb = verbs[action]?.[lang === "ru" ? 0 : 1] ?? action;
  return `${entity} · ${verb}`;
}

function timeAgo(iso: string, lang: "ru" | "en"): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return lang === "ru" ? "только что" : "just now";
  if (minutes < 60) return lang === "ru" ? `${minutes} мин. назад` : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return lang === "ru" ? `${hours} ч. назад` : `${hours} h ago`;
  const days = Math.round(hours / 24);
  return lang === "ru" ? `${days} дн. назад` : `${days} d ago`;
}
