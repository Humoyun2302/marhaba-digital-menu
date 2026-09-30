import { useEffect, useRef } from "react";
import { useLanguage } from "../../i18n/language";
import type { Category } from "../../types/menu";
import { localizedName } from "../../utils/format";

type CategoryNavProps = {
  categories: Category[];
  activeId: string | null;
  onSelect: (id: string) => void;
};

export function CategoryNav({ categories, activeId, onSelect }: CategoryNavProps) {
  const { lang } = useLanguage();
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeId || !scroller.current) return;
    const chip = scroller.current.querySelector<HTMLElement>(`[data-category="${activeId}"]`);
    chip?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeId]);

  if (!categories.length) return null;

  return (
    <nav aria-label={lang === "ru" ? "Категории" : "Categories"} className="border-b border-line bg-ivory/95">
      <div
        ref={scroller}
        className="no-scrollbar mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 py-2.5 sm:px-6"
      >
        {categories.map((category) => {
          const active = category.id === activeId;
          const label = localizedName(lang, category.name_ru, category.name_en);
          return (
            <button
              key={category.id}
              type="button"
              data-category={category.id}
              aria-current={active ? "true" : undefined}
              onClick={() => onSelect(category.id)}
              className={`h-11 shrink-0 px-3.5 text-sm tracking-wide ${
                active ? "bg-burgundy text-ivory" : "border border-line bg-paper text-wine"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
