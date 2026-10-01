import { useEffect, useRef, useState } from "react";
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
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const sync = () => {
      setEdges({
        left: node.scrollLeft > 8,
        right: node.scrollLeft + node.clientWidth < node.scrollWidth - 8,
      });
    };
    sync();
    node.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [categories]);

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
    <nav aria-label={lang === "ru" ? "Категории" : "Categories"} className="relative">
      <div ref={scroller} className="no-scrollbar -mx-1 flex scroll-px-4 gap-2 overflow-x-auto scroll-smooth px-1 py-0.5">
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
      {edges.left ? <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-ivory via-ivory/80 to-transparent" /> : null}
      {edges.right ? <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-ivory via-ivory/80 to-transparent" /> : null}
    </nav>
  );
}
