import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Flourish } from "../components/Ornament";
import { Button, EmptyState, SearchField, SkeletonBlock } from "../components/ui";
import { CategoryNav } from "../features/menu/CategoryNav";
import { FoodCard } from "../features/menu/FoodCard";
import { ItemDetail } from "../features/menu/ItemDetail";
import { fetchPublicMenu, fetchSettings } from "../features/menu/api";
import { MenuFooter } from "../features/menu/MenuFooter";
import { MenuHeader } from "../features/menu/MenuHeader";
import { CartButton, CartSheet } from "../features/orders/CartSheet";
import { fetchOrderingStatus } from "../features/orders/api";
import { useVisit } from "../features/orders/visit-context";
import { formatTableNumber } from "../features/qr/url";
import { useLanguage } from "../i18n/language";
import type { Category, MenuItem } from "../types/menu";
import { errorText, localizedName } from "../utils/format";

export function MenuPage() {
  const { lang, t } = useLanguage();
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const { visit, notice, startNewVisit, dismissNotice } = useVisit();
  const [startingVisit, setStartingVisit] = useState(false);
  const stickyRef = useRef<HTMLDivElement>(null);
  const lockSpy = useRef(false);
  const menuQuery = useQuery({ queryKey: ["public-menu"], queryFn: fetchPublicMenu });
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
  const ordering = useQuery({ queryKey: ["ordering-status"], queryFn: fetchOrderingStatus });

  const visible = useMemo(
    () => filterMenu(menuQuery.data ?? [], query, lang),
    [menuQuery.data, query, lang],
  );

  const visitKey = `${visit?.token ?? ""}:${visit?.sessionId ?? ""}`;
  const [cartVisit, setCartVisit] = useState(visitKey);
  if (cartVisit !== visitKey) {
    setCartVisit(visitKey);
    setCartOpen(false);
  }

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
    document.getElementById(`category-${id}`)?.scrollIntoView({ block: "start" });
    window.setTimeout(() => {
      lockSpy.current = false;
    }, 800);
  }

  const loadError = menuQuery.error;

  return (
    <div id="top" className="min-h-dvh overflow-x-clip">
      <a
        href="#menu-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-paper focus:px-3 focus:py-2"
      >
        {t.skip}
      </a>
      <div ref={stickyRef} className="sticky top-0 z-50 border-b border-line/80 bg-ivory/95 px-3.5 pt-[max(0.65rem,env(safe-area-inset-top))] pb-3 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2.5">
          <MenuHeader logoUrl={settingsQuery.data?.logo_url} />
          <div className="flex flex-wrap items-center gap-2">
            {visit ? (
              <p data-table={visit.tableNumber} className="rounded-full bg-burgundy px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-ivory uppercase">
                {t.tableBadge.replace("{n}", formatTableNumber(visit.tableNumber))}
              </p>
            ) : null}
            <Link to="/my-orders" className="text-xs font-semibold tracking-[0.08em] text-burgundy uppercase">{t.myOrders}</Link>
            {visit?.resumed ? (
              <button
                type="button"
                disabled={startingVisit}
                onClick={() => {
                  setStartingVisit(true);
                  void startNewVisit().finally(() => setStartingVisit(false));
                }}
                className="text-xs font-semibold tracking-[0.08em] text-burgundy uppercase"
              >
                {t.newVisit}
              </button>
            ) : null}
          </div>
          {notice ? (
            <div className="flex items-start justify-between gap-3 rounded-[18px] border border-gold/40 bg-paper px-4 py-3 text-sm text-ink">
              <p>{notice.status === "cancelled" ? t.orderCancelledBanner : t.orderServedBanner} #{notice.publicNumber}{notice.reason ? `. ${notice.reason}` : ""}</p>
              <button type="button" onClick={dismissNotice} className="shrink-0 text-xs font-semibold text-burgundy uppercase">{t.doneAck}</button>
            </div>
          ) : null}
          {ordering.data && !ordering.data.accepting ? (
            <p className="text-sm text-burgundy">{ordering.data.closedReason === "ORDERS_PAUSED" ? t.orderingPaused : ordering.data.closedReason === "OUTSIDE_HOURS" ? t.orderingHours : ordering.data.closedReason === "ORDERING_DISABLED" ? t.orderingOff : t.orderingSetup}</p>
          ) : null}
          <div className="max-w-md">
          <SearchField
            pill
            value={query}
            onChange={setQuery}
            placeholder={t.searchPlaceholder}
            label={t.searchLabel}
            clearLabel={t.clearSearch}
            onClear={() => setQuery("")}
          />
          </div>
          {!menuQuery.isLoading && !loadError ? <CategoryNav categories={visible} activeId={resolvedActiveId} onSelect={selectCategory} /> : null}
        </div>
      </div>

      <main id="menu-content" className="mx-auto w-full max-w-6xl px-3.5 py-6 pb-28 sm:px-6 sm:py-8">
        {menuQuery.isLoading ? <MenuSkeleton /> : null}
        {loadError ? (
          <EmptyState
            title={t.loadError}
            text={import.meta.env.DEV ? `${t.loadErrorHint} ${errorText(loadError)}` : t.loadErrorHint}
            action={
              <Button
                onClick={() => {
                  void menuQuery.refetch();
                  void settingsQuery.refetch();
                }}
              >
                {t.retry}
              </Button>
            }
          />
        ) : null}
        {!menuQuery.isLoading && !loadError && visible.length === 0 && query.trim() ? (
          <div className="px-2 py-10 text-center">
            <Flourish className="mx-auto mb-4 h-4 w-36 text-burgundy/70" />
            <p className="font-serif text-3xl text-ink">{t.nothingFound}</p>
            <p className="mt-2 text-sm text-muted">{t.nothingFoundHint}</p>
          </div>
        ) : null}
        {!menuQuery.isLoading && !loadError && visible.length === 0 && !query.trim() ? (
          <div className="px-2 py-10 text-center">
            <p className="font-serif text-3xl text-ink">{t.emptyMenu}</p>
          </div>
        ) : null}
        <div className="flex flex-col gap-10 sm:gap-14">
          {visible.map((category) => {
            const title = localizedName(lang, category.name_ru, category.name_en);
            const alt = (lang === "ru" ? category.name_en : category.name_ru)?.trim();
            const showAlt = Boolean(alt) && alt.toLocaleLowerCase() !== title.toLocaleLowerCase();
            return (
              <section key={category.id} id={`category-${category.id}`} className="menu-section">
                <header className="mb-4 text-center sm:mb-6">
                  <h2 className="font-serif text-[2.15rem] leading-none text-ink sm:text-5xl">{title}</h2>
                  <div className="mx-auto mt-3 h-px w-14 bg-burgundy/30" />
                  {showAlt ? <p className="mt-2 text-[11px] font-medium tracking-[0.18em] text-muted uppercase">{alt}</p> : null}
                </header>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
                  {category.menu_items.map((item) => (
                    <FoodCard key={item.id} item={item} onOpen={setOpenItem} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>
      <MenuFooter settings={settingsQuery.data ?? null} />
      {cartOpen ? null : <CartButton onClick={() => setCartOpen(true)} />}
      <CartSheet open={cartOpen} onClose={() => setCartOpen(false)} />
      <ItemDetail
        item={openItem}
        categoryName={
          openItem
            ? localizedName(
                lang,
                (menuQuery.data ?? []).find((category) => category.id === openItem.category_id)?.name_ru,
                (menuQuery.data ?? []).find((category) => category.id === openItem.category_id)?.name_en,
              )
            : ""
        }
        onClose={() => setOpenItem(null)}
      />
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
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-[22px] border border-line bg-paper">
          <SkeletonBlock className="aspect-[4/3] rounded-none" />
          <div className="space-y-2 p-3">
            <SkeletonBlock className="h-5 w-4/5" />
            <SkeletonBlock className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
