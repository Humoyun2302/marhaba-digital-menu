import { useLanguage } from "../../i18n/language";
import type { MenuItem } from "../../types/menu";
import { localizedName, priceLines } from "../../utils/format";

type MenuItemRowProps = {
  item: MenuItem;
  onOpen: (item: MenuItem) => void;
};

export function MenuItemRow({ item, onOpen }: MenuItemRowProps) {
  const { lang, t } = useLanguage();
  const name = localizedName(lang, item.name_ru, item.name_en);
  const description = localizedName(lang, item.description_ru, item.description_en);
  const lines = priceLines(item.item_price_options, lang);
  const hasDetails = Boolean(item.image_url || description);
  const labeled = item.item_price_options.some((option) =>
    localizedName(lang, option.label_ru, option.label_en),
  );

  const body = (
    <>
      {item.image_url ? (
        <img
          src={item.image_url}
          alt={name}
          width={72}
          height={72}
          loading="lazy"
          decoding="async"
          className="h-[4.5rem] w-[4.5rem] shrink-0 object-cover"
        />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          {item.is_featured ? (
            <span
              role="img"
              aria-label={t.featured}
              title={t.featured}
              className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rotate-45 bg-gold"
            />
          ) : null}
          <span className="font-medium leading-snug text-ink">{name}</span>
        </span>
        {description ? <span className="mt-1 block text-sm leading-relaxed text-muted">{description}</span> : null}
      </span>
      <span
        className={`shrink-0 text-right font-semibold tabular-nums text-wine ${
          labeled ? "flex flex-col items-end gap-1 text-sm" : "whitespace-nowrap text-[0.95rem]"
        }`}
      >
        {labeled
          ? lines.map((line) => (
              <span key={line} className="whitespace-nowrap">
                {line}
              </span>
            ))
          : lines.join(" / ")}
      </span>
    </>
  );

  const className =
    "flex w-full items-start gap-3 border-b border-line py-3.5 text-left last:border-b-0";

  if (!hasDetails) {
    return <article className={className}>{body}</article>;
  }

  return (
    <button type="button" className={`${className} rounded-sm`} onClick={() => onOpen(item)} aria-haspopup="dialog">
      {body}
    </button>
  );
}
