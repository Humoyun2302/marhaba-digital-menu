import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Flourish, PageOrnaments } from "../components/Ornament";
import { CategoryNav } from "../features/menu/CategoryNav";
import { ItemDetail } from "../features/menu/ItemDetail";
import { fetchPublicMenu, fetchSettings } from "../features/menu/api";
import { MenuFooter } from "../features/menu/MenuFooter";
import { MenuHeader } from "../features/menu/MenuHeader";
import { MenuItemRow } from "../features/menu/MenuItemRow";
import { useLanguage } from "../i18n/language";
import type { Category, MenuItem } from "../types/menu";
import { errorText, localizedName } from "../utils/format";

export function MenuPage() {
  const { lang, t } = useLanguage();
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<MenuItem | null>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const lockSpy = useRef(false);
  const menuQuery = useQuery({ queryKey: ["public-menu"], queryFn: fetchPublicMenu });
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });

  const visible = useMemo(
    () => filterMenu(menuQuery.data ?? [], query, lang),
    [menuQuery.data, query, lang],
  );

  useEffect(() => {
    const node = stickyRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty("--sticky-offset", `${node.offsetHeight}px`);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [menuQuery.isSuccess]);

  const resolvedActiveId = visible.some((category) => category.id === activeId)
    ? activeId
    : (visible[0]?.id ?? null);

  useEffect(() => {
    const ids = visible.map((category) => category.id);
    const nodes = ids
      .map((id) => document.getElementById(`category-${id}`))
      .filter((node): node is HTMLElement => Boolean(node));
    if (!nodes.length) return;

    const offset = stickyRef.current?.offsetHeight ?? 140;
    const observer = new IntersectionObserver(
      (entries) => {
        if (lockSpy.current) return;
        const intersecting = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const next = intersecting[0]?.target.id.replace("category-", "");
        if (next) setActiveId(next);
      },
      { rootMargin: `-${offset}px 0px -55% 0px`, threshold: 0 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [visible]);

  function selectCategory(id: string) {
    setActiveId(id);
    lockSpy.current = true;
    document.getElementById(`category-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      lockSpy.current = false;
    }, 800);
  }

  const loadError = menuQuery.error;

  return (
    <div id="top" className="min-h-dvh overflow-x-clip">
      <PageOrnaments />
      <a
        href="#menu-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-paper focus:px-3 focus:py-2"
      >
        {t.skip}
      </a>
      <div ref={stickyRef} className="sticky top-0 z-30">
        <MenuHeader logoUrl={settingsQuery.data?.logo_url} />
        <div className="border-b border-line bg-ivory/95">
          <div className="mx-auto max-w-3xl px-4 py-2.5 sm:px-6">
            <label className="relative block">
              <span className="sr-only">{t.searchLabel}</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.searchPlaceholder}
                enterKeyHint="search"
                className="h-11 w-full border border-line bg-paper px-3 pr-12 text-base text-ink placeholder:text-muted"
              />
              {query ? (
                <button
                  type="button"
                  aria-label={t.clearSearch}
                  onClick={() => setQuery("")}
                  className="absolute top-0 right-0 grid h-11 w-11 place-items-center text-burgundy"
                >
                  ×
                </button>
              ) : null}
            </label>
          </div>
        </div>
        {!menuQuery.isLoading && !loadError ? (
          <CategoryNav categories={visible} activeId={resolvedActiveId} onSelect={selectCategory} />
        ) : null}
      </div>

      <main id="menu-content" className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        {menuQuery.isLoading ? <MenuSkeleton /> : null}
        {loadError ? (
          <div className="border border-line bg-paper px-5 py-8 text-center">
            <p className="font-serif text-3xl text-wine">{t.loadError}</p>
            <p className="mt-2 text-sm text-muted">{t.loadErrorHint}</p>
            {import.meta.env.DEV ? <p className="mt-3 text-xs text-muted">{errorText(loadError)}</p> : null}
            <button
              type="button"
              onClick={() => {
                void menuQuery.refetch();
                void settingsQuery.refetch();
              }}
              className="mt-5 h-11 bg-burgundy px-5 text-sm text-ivory"
            >
              {t.retry}
            </button>
          </div>
        ) : null}
        {!menuQuery.isLoading && !loadError && visible.length === 0 && query.trim() ? (
          <div className="px-4 py-16 text-center">
            <Flourish className="mx-auto mb-4 h-4 w-36 text-burgundy/70" />
            <p className="font-serif text-3xl text-wine">{t.nothingFound}</p>
            <p className="mt-2 text-sm text-muted">{t.nothingFoundHint}</p>
          </div>
        ) : null}
        {!menuQuery.isLoading && !loadError && visible.length === 0 && !query.trim() ? (
          <div className="px-4 py-16 text-center">
            <p className="font-serif text-3xl text-wine">{t.emptyMenu}</p>
          </div>
        ) : null}
        {visible.map((category) => (
          <section key={category.id} id={`category-${category.id}`} className="menu-section pt-8 first:pt-2">
            <h2 className="font-serif text-[2rem] leading-none text-wine">
              {localizedName(lang, category.name_ru, category.name_en)}
            </h2>
            <Flourish className="mt-3 mb-1 h-4 w-36 text-burgundy/80" />
            <div>
              {category.menu_items.map((item) => (
                <MenuItemRow key={item.id} item={item} onOpen={setOpenItem} />
              ))}
            </div>
          </section>
        ))}
      </main>
      <MenuFooter settings={settingsQuery.data ?? null} />
      <ItemDetail item={openItem} onClose={() => setOpenItem(null)} />
    </div>
  );
}

function filterMenu(categories: Category[], query: string, lang: "ru" | "en"): Category[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return categories;
  return categories
    .map((category) => ({
      ...category,
      menu_items: category.menu_items.filter((item) => {
        const name = localizedName(lang, item.name_ru, item.name_en).toLocaleLowerCase();
        const description = localizedName(lang, item.description_ru, item.description_en).toLocaleLowerCase();
        return name.includes(needle) || description.includes(needle);
      }),
    }))
    .filter((category) => category.menu_items.length > 0);
}

function MenuSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="h-8 w-40 bg-burgundy/10" />
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center justify-between gap-4 border-b border-line py-4">
          <div className="h-4 w-2/3 bg-burgundy/10" />
          <div className="h-4 w-16 bg-burgundy/10" />
        </div>
      ))}
    </div>
  );
}
