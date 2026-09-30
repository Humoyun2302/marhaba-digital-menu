import { useLanguage } from "../../i18n/language";
import type { MenuItem } from "../../types/menu";
import { localizedName, priceLines } from "../../utils/format";

export function MenuItemRow({ item, onOpen }: { item: MenuItem; onOpen: (item: MenuItem) => void }) {
  const { lang, t } = useLanguage();
  const name = localizedName(lang, item.name_ru, item.name_en);
  const description = localizedName(lang, item.description_ru, item.description_en);
  const lines = priceLines(item.item_price_options, lang);
  const hasDetails = Boolean(item.image_url || description);
  const labeled = item.item_price_options.some((option) => localizedName(lang, option.label_ru, option.label_en));

  const inner = (
    <>
      {item.image_url ? (
        <img src={item.image_url} alt={name} width={72} height={72} loading="lazy" decoding="async" className="h-[4.5rem] w-[4.5rem] shrink-0 rounded-md object-cover" />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          {item.is_featured ? <span role="img" aria-label={t.featured} className="inline-block h-1.5 w-1.5 rotate-45 bg-gold" /> : null}
          <span className="font-semibold leading-snug text-ink">{name}</span>
        </span>
        {description ? <span className="mt-1 block text-sm leading-relaxed text-muted">{description}</span> : null}
      </span>
      <span className={`shrink-0 text-right font-semibold tabular-nums text-burgundy ${labeled ? "flex flex-col items-end gap-1 text-sm" : "whitespace-nowrap"}`}>
        {labeled ? lines.map((line) => <span key={line}>{line}</span>) : lines.join(" / ")}
      </span>
    </>
  );

  const className = "flex w-full items-start gap-3 rounded-lg border border-line bg-paper px-4 py-4 text-left shadow-[var(--shadow-soft)] hover:-translate-y-px";

  if (!hasDetails) return <article className={className}>{inner}</article>;

  return (
    <button type="button" className={className} onClick={() => onOpen(item)} aria-haspopup="dialog">
      {inner}
    </button>
  );
}
