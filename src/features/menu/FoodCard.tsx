import { useLanguage } from "../../i18n/language";
import type { MenuItem } from "../../types/menu";
import { localizedName, publicPriceLines } from "../../utils/format";
import { resolveDishPhoto } from "./photos";

export function FoodCard({ item, onOpen }: { item: MenuItem; onOpen: (item: MenuItem) => void }) {
  const { lang, t } = useLanguage();
  const name = localizedName(lang, item.name_ru, item.name_en);
  const description = localizedName(lang, item.description_ru, item.description_en);
  const serving = localizedName(lang, item.serving_ru, item.serving_en);
  const lines = publicPriceLines(item.item_price_options, lang);
  const photo = resolveDishPhoto(item);

  return (
    <article className="h-full">
      <button
        type="button"
        onClick={() => onOpen(item)}
        aria-haspopup="dialog"
        className="flex h-full w-full flex-col overflow-hidden rounded-[22px] border border-[#e7ddd0] bg-paper text-left shadow-[0_10px_28px_rgba(77,17,24,0.06)]"
      >
        <span className="relative block aspect-[4/3] overflow-hidden bg-[#f3eadf]">
          {photo ? (
            <img
              src={photo.card}
              alt=""
              width={960}
              height={720}
              loading="lazy"
              decoding="async"
              sizes="(min-width: 1024px) 22vw, (min-width: 768px) 30vw, 46vw"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="photo-fallback grid h-full place-items-center" aria-hidden="true">
              <span className="font-serif text-3xl tracking-[0.18em] text-burgundy/35">M</span>
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col px-3 pt-3 pb-3 sm:px-3.5">
          {item.is_featured ? (
            <span className="mb-2 inline-flex w-fit rounded-full bg-burgundy px-2 py-1 text-[9px] font-semibold tracking-[0.14em] text-ivory uppercase sm:text-[10px]">
              {t.featured}
            </span>
          ) : null}
          <span className="font-serif text-[1.05rem] leading-[1.15] break-words text-ink sm:text-[1.35rem]">{name}</span>
          {description ? (
            <span className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted sm:text-[13px]">{description}</span>
          ) : null}
          <span className="mt-auto block pt-2.5">
            <span className="mb-2 block h-px bg-burgundy/10" />
            <span className="flex flex-col gap-0.5">
              {lines.map((line) => (
                <span key={line} className="text-[13px] leading-snug font-bold break-words text-ink tabular-nums sm:text-[15px]">
                  {line}
                </span>
              ))}
              {serving ? <span className="text-[11px] leading-snug text-muted sm:text-xs">{serving}</span> : null}
            </span>
            <span className="mt-2 block text-[10px] font-semibold tracking-[0.16em] text-burgundy uppercase sm:text-[11px]">
              {t.more}
            </span>
          </span>
        </span>
      </button>
    </article>
  );
}
