import { useQuery } from "@tanstack/react-query";
import { fetchDashboard, type RecentDish } from "../../features/admin/api";
import { useLanguage } from "../../i18n/language";
import { errorText, localizedName } from "../../utils/format";

export function DashboardPage() {
  const { lang, t } = useLanguage();
  const query = useQuery({ queryKey: ["admin-dashboard"], queryFn: fetchDashboard });

  if (query.isLoading) return <Skeleton />;
  if (query.isError) {
    return (
      <div className="border border-line bg-paper p-6">
        <p>{t.loadError}</p>
        {import.meta.env.DEV ? <p className="mt-2 text-xs text-muted">{errorText(query.error)}</p> : null}
        <button type="button" onClick={() => void query.refetch()} className="mt-4 h-11 bg-burgundy px-4 text-sm text-ivory">
          {t.retry}
        </button>
      </div>
    );
  }

  const data = query.data;
  if (!data) return null;
  const hidden = Math.max(0, data.total - data.available);

  return (
    <div>
      <h1 className="font-serif text-4xl text-wine">{t.dashboard}</h1>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t.totalDishes} value={data.total} />
        <Stat label={t.available} value={data.available} />
        <Stat label={t.hidden} value={hidden} />
        <Stat label={t.categoryCount} value={data.categories} />
      </div>
      <section className="mt-8">
        <h2 className="font-serif text-2xl text-wine">{t.recent}</h2>
        {data.recent.length === 0 ? <p className="mt-3 text-sm text-muted">{t.noRecent}</p> : null}
        <ul className="mt-3 divide-y divide-line border border-line bg-paper">
          {data.recent.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium">{localizedName(lang, item.name_ru, item.name_en)}</p>
                <p className="text-sm text-muted">{categoryName(item, lang)}</p>
              </div>
              <span className="text-xs tracking-wide text-burgundy">{item.is_available ? t.available : t.hidden}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function categoryName(item: RecentDish, lang: "ru" | "en"): string {
  const category = Array.isArray(item.categories) ? item.categories[0] : item.categories;
  if (!category) return "";
  return localizedName(lang, category.name_ru, category.name_en);
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-line bg-paper px-4 py-4">
      <p className="text-xs tracking-wide text-muted">{label}</p>
      <p className="mt-2 font-serif text-4xl text-wine">{value}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-2 gap-3" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="h-24 bg-burgundy/10" />
      ))}
    </div>
  );
}
