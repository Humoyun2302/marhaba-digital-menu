import { useEffect, useRef } from "react";
import { useLanguage } from "../../i18n/language";
import type { Category } from "../../types/menu";
import { localizedName } from "../../utils/format";

export function CategoryNav({
  categories,
  activeId,
  onSelect,
}: {
  categories: Category[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const { lang } = useLanguage();
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeId || !scroller.current) return;
    const tab = scroller.current.querySelector<HTMLElement>(`[data-category="${activeId}"]`);
    if (!tab) return;
    const next = tab.offsetLeft - (scroller.current.clientWidth - tab.offsetWidth) / 2;
    scroller.current.scrollTo({ left: Math.max(0, next) });
  }, [activeId]);

  if (!categories.length) return null;

  return (
    <nav aria-label={lang === "ru" ? "Категории" : "Categories"} className="relative">
      <div ref={scroller} className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5">
        {categories.map((category) => {
          const active = category.id === activeId;
          return (
            <button
              key={category.id}
              type="button"
              data-category={category.id}
              aria-current={active ? "true" : undefined}
              onClick={() => onSelect(category.id)}
              className={`h-10 shrink-0 rounded-full px-3.5 text-[13px] font-medium sm:h-11 sm:px-4 sm:text-sm ${
                active
                  ? "bg-burgundy text-ivory shadow-[0_8px_18px_rgba(114,31,42,0.22)]"
                  : "border border-line bg-paper text-ink hover:border-burgundy/25"
              }`}
            >
              {localizedName(lang, category.name_ru, category.name_en)}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
