import { useLanguage } from "../../i18n/language";
import type { MenuItem } from "../../types/menu";
import { localizedName, publicPriceLines } from "../../utils/format";
import { useCart } from "../orders/cart-context";
import { resolveDishPhoto } from "./photos";

export function FoodCard({ item, onOpen }: { item: MenuItem; onOpen: (item: MenuItem) => void }) {
  const { lang, t } = useLanguage();
  const cart = useCart();
  const name = localizedName(lang, item.name_ru, item.name_en);
  const description = localizedName(lang, item.description_ru, item.description_en);
  const serving = localizedName(lang, item.serving_ru, item.serving_en);
  const lines = publicPriceLines(item.item_price_options, lang);
  const photo = resolveDishPhoto(item);
  const onlyOption = item.item_price_options.length === 1 ? item.item_price_options[0] : null;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-[22px] border border-[#e7ddd0] bg-paper shadow-[0_10px_28px_rgba(77,17,24,0.06)]">
      <button
        type="button"
        onClick={() => onOpen(item)}
        aria-haspopup="dialog"
        className="flex min-h-0 w-full flex-1 flex-col text-left"
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
        <span className="flex min-w-0 flex-1 flex-col px-3 pt-3 pb-2 sm:px-3.5">
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
          </span>
        </span>
      </button>
      {item.item_price_options.length > 0 ? (
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={() => {
              if (!onlyOption) {
                onOpen(item);
                return;
              }
              cart.add({ itemId: item.id, optionId: onlyOption.id, quantity: 1, note: "" });
            }}
            className="h-10 w-full rounded-full bg-burgundy text-[11px] font-semibold tracking-[0.12em] text-ivory uppercase"
          >
            {t.addToCart}
          </button>
        </div>
      ) : null}
    </article>
  );
}
