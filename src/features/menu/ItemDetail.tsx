import { Dialog } from "../../components/Dialog";
import { useLanguage } from "../../i18n/language";
import type { MenuItem } from "../../types/menu";
import { localizedName, priceLines } from "../../utils/format";

type ItemDetailProps = {
  item: MenuItem | null;
  onClose: () => void;
};

export function ItemDetail({ item, onClose }: ItemDetailProps) {
  const { lang, t } = useLanguage();
  const name = item ? localizedName(lang, item.name_ru, item.name_en) : "";
  const description = item ? localizedName(lang, item.description_ru, item.description_en) : "";
  const lines = item ? priceLines(item.item_price_options, lang) : [];

  return (
    <Dialog open={Boolean(item)} title={name || t.details} closeLabel={t.close} onClose={onClose}>
      {item?.image_url ? (
        <img
          src={item.image_url}
          alt={name}
          width={640}
          height={480}
          className="mb-4 aspect-[4/3] w-full object-cover"
        />
      ) : null}
      {description ? <p className="text-base leading-relaxed text-ink">{description}</p> : null}
      <div className="mt-4 flex flex-col items-start gap-1 font-semibold tabular-nums text-wine">
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>
    </Dialog>
  );
}
