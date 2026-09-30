import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Dialog } from "../../components/Dialog";
import { useToast } from "../../components/toast-context";
import { deleteItem, duplicateItem, fetchAdminMenu, saveItem, saveOrder, setItemAvailability } from "../../features/admin/api";
import { useLanguage } from "../../i18n/language";
import type { ItemDraft, MenuItem } from "../../types/menu";
import { errorText, localizedName, priceLines } from "../../utils/format";
import { ItemForm } from "./ItemForm";

export function ItemsPage() {
  const { lang, t } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const menu = useQuery({ queryKey: ["admin-menu"], queryFn: fetchAdminMenu });
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<MenuItem | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MenuItem | null>(null);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-menu"] });
    await queryClient.invalidateQueries({ queryKey: ["public-menu"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-activity"] });
  };

  const saveMutation = useMutation({
    mutationFn: ({ id, draft }: { id: string | null; draft: ItemDraft }) => saveItem(id, draft),
    onSuccess: async () => {
      await invalidate();
      toast.push("success", t.saved);
    },
  });
  const availabilityMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) => setItemAvailability(id, value),
    onSuccess: invalidate,
    onError: (error) => toast.push("error", errorText(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteItem,
    onSuccess: async () => {
      setPendingDelete(null);
      await invalidate();
      toast.push("success", t.deleted);
    },
    onError: (error) => toast.push("error", errorText(error)),
  });
  const duplicateMutation = useMutation({
    mutationFn: (item: MenuItem) => duplicateItem(item, t.copySuffix),
    onSuccess: async () => {
      await invalidate();
      toast.push("success", t.duplicated);
    },
    onError: (error) => toast.push("error", errorText(error)),
  });
  const orderMutation = useMutation({
    mutationFn: (ids: string[]) => saveOrder("menu_items", ids),
    onSuccess: invalidate,
    onError: (error) => toast.push("error", errorText(error)),
  });

  const categories = menu.data ?? [];
  const items = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return (menu.data ?? []).flatMap((category) =>
      category.menu_items
        .filter((item) => categoryId === "all" || item.category_id === categoryId)
        .filter((item) => status === "all" || (status === "on" ? item.is_available : !item.is_available))
        .filter((item) => {
          if (!needle) return true;
          return (
            item.name_ru.toLocaleLowerCase().includes(needle) ||
            item.name_en.toLocaleLowerCase().includes(needle)
          );
        })
        .map((item) => ({ item, category })),
    );
  }, [menu.data, search, categoryId, status]);

  const canReorder = categoryId !== "all" && !search && status === "all";

  function move(itemId: string, direction: -1 | 1) {
    const ids = items.map((entry) => entry.item.id);
    const index = ids.indexOf(itemId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= ids.length) return;
    const reordered = [...ids];
    const [moved] = reordered.splice(index, 1);
    if (!moved) return;
    reordered.splice(next, 0, moved);
    orderMutation.mutate(reordered);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-4xl text-wine">{t.dishes}</h1>
        <button type="button" onClick={() => setEditing("new")} className="h-11 rounded-md bg-burgundy px-4 text-sm text-ivory">
          {t.addDish}
        </button>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t.searchDishes}
          aria-label={t.searchDishes}
          className="h-11 border border-line bg-paper px-3 text-base"
        />
        <select
          aria-label={t.category}
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className="h-11 border border-line bg-paper px-3 text-base"
        >
          <option value="all">{t.allCategories}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {localizedName(lang, category.name_ru, category.name_en)}
            </option>
          ))}
        </select>
        <select
          aria-label={t.allStatuses}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-11 border border-line bg-paper px-3 text-base"
        >
          <option value="all">{t.allStatuses}</option>
          <option value="on">{t.statusAvailable}</option>
          <option value="off">{t.statusHidden}</option>
        </select>
      </div>
      <p className="mt-2 text-xs text-muted">{canReorder ? t.reorderHint : t.filterCategoryHint}</p>
      {menu.isLoading ? <div className="mt-4 h-40 animate-pulse bg-burgundy/10" /> : null}
      {menu.isError ? <p className="mt-4 text-burgundy">{t.loadError}</p> : null}
      {!menu.isLoading && items.length === 0 ? <p className="mt-6 text-muted">{t.noDishes}</p> : null}
      <ul className="mt-4 space-y-2">
        {items.map(({ item, category }, index) => (
          <li key={item.id} className="rounded-lg border border-line bg-paper p-4 shadow-[var(--shadow-soft)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{localizedName(lang, item.name_ru, item.name_en)}</p>
                <p className="text-sm text-muted">{localizedName(lang, category.name_ru, category.name_en)}</p>
                <p className="mt-1 text-sm tabular-nums text-wine">{priceLines(item.item_price_options, lang).join(" / ")}</p>
              </div>
              <button
                type="button"
                aria-pressed={item.is_available}
                onClick={() => availabilityMutation.mutate({ id: item.id, value: !item.is_available })}
                className={`h-11 shrink-0 px-3 text-xs ${item.is_available ? "bg-burgundy text-ivory" : "border border-line text-muted"}`}
              >
                {item.is_available ? t.hide : t.show}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="h-11 border border-line px-3 text-sm" onClick={() => setEditing(item)}>
                {t.editDish}
              </button>
              <button type="button" className="h-11 border border-line px-3 text-sm" onClick={() => duplicateMutation.mutate(item)}>
                {t.duplicate}
              </button>
              <button type="button" className="h-11 border border-burgundy px-3 text-sm text-burgundy" onClick={() => setPendingDelete(item)}>
                {t.delete}
              </button>
              <button type="button" className="h-11 px-3 text-sm disabled:opacity-40" disabled={!canReorder || index === 0} onClick={() => move(item.id, -1)}>
                {t.moveUp}
              </button>
              <button
                type="button"
                className="h-11 px-3 text-sm disabled:opacity-40"
                disabled={!canReorder || index === items.length - 1}
                onClick={() => move(item.id, 1)}
              >
                {t.moveDown}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {editing ? (
        <ItemForm
          key={editing === "new" ? "new" : editing.id}
          categories={categories}
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (id, draft) => {
            await saveMutation.mutateAsync({ id, draft });
          }}
        />
      ) : null}
      <Dialog open={Boolean(pendingDelete)} title={t.confirmDeleteDish} closeLabel={t.close} onClose={() => setPendingDelete(null)}>
        <p>{pendingDelete ? localizedName(lang, pendingDelete.name_ru, pendingDelete.name_en) : ""}</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={deleteMutation.isPending}
            onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete)}
            className="h-11 flex-1 bg-burgundy text-sm text-ivory disabled:opacity-60"
          >
            {t.delete}
          </button>
          <button type="button" onClick={() => setPendingDelete(null)} className="h-11 border border-line px-4 text-sm">
            {t.cancel}
          </button>
        </div>
      </Dialog>
    </div>
  );
}
