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
    scroller.current.querySelector<HTMLElement>(`[data-category="${activeId}"]`)?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
  }, [activeId]);

  if (!categories.length) return null;

  return (
    <nav aria-label={lang === "ru" ? "Категории" : "Categories"}>
      <div ref={scroller} className="no-scrollbar flex gap-2 overflow-x-auto py-1">
        {categories.map((category) => {
          const active = category.id === activeId;
          return (
            <button
              key={category.id}
              type="button"
              data-category={category.id}
              aria-current={active ? "true" : undefined}
              onClick={() => onSelect(category.id)}
              className={`h-11 shrink-0 rounded-full px-4 text-sm font-medium ${
                active ? "bg-burgundy text-ivory shadow-sm" : "border border-line bg-paper text-ink hover:border-burgundy/30"
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
