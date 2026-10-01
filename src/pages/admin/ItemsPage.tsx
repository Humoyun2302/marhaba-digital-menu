import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Plus, UtensilsCrossed } from "lucide-react";
import { useMemo, useState } from "react";
import { Dialog } from "../../components/Dialog";
import { useToast } from "../../components/toast-context";
import {
  ActionMenu,
  AdminPageHeader,
  Button,
  DialogActions,
  EmptyState,
  EntityCard,
  SearchField,
  Select,
  SkeletonBlock,
  StatusBadge,
} from "../../components/ui";
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
      <AdminPageHeader
        title={t.dishes}
        description={t.manageDishes}
        action={
          <Button className="w-full sm:w-auto" onClick={() => setEditing("new")}>
            <Plus size={18} />
            {t.addDish}
          </Button>
        }
      />
      <div className="mt-5 grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder={t.searchDishes}
          label={t.searchDishes}
          clearLabel={t.clearSearch}
          onClear={() => setSearch("")}
        />
        <Select aria-label={t.category} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="all">{t.allCategories}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {localizedName(lang, category.name_ru, category.name_en)}
            </option>
          ))}
        </Select>
        <Select aria-label={t.allStatuses} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">{t.allStatuses}</option>
          <option value="on">{t.statusAvailable}</option>
          <option value="off">{t.statusHidden}</option>
        </Select>
      </div>
      <p className="mt-3 text-xs text-muted">{canReorder ? t.reorderHint : t.filterCategoryHint}</p>
      {menu.isLoading ? (
        <div className="mt-5 space-y-3">
          <SkeletonBlock className="h-32" />
          <SkeletonBlock className="h-32" />
        </div>
      ) : null}
      {menu.isError ? (
        <div className="mt-5">
          <EmptyState title={t.loadError} action={<Button onClick={() => void menu.refetch()}>{t.retry}</Button>} />
        </div>
      ) : null}
      {!menu.isLoading && !menu.isError && items.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon={<UtensilsCrossed size={20} />}
            title={t.noDishes}
            action={
              <Button onClick={() => setEditing("new")}>
                <Plus size={18} />
                {t.addDish}
              </Button>
            }
          />
        </div>
      ) : null}
      <ul className="mt-5 space-y-3">
        {items.map(({ item, category }, index) => {
          const lines = priceLines(item.item_price_options, lang);
          return (
            <li key={item.id}>
              <EntityCard>
                <div className="flex items-start gap-3">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-[16px] object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold leading-snug break-words text-ink">
                        {localizedName(lang, item.name_ru, item.name_en)}
                      </p>
                      <StatusBadge active={item.is_available} activeLabel={t.available} inactiveLabel={t.hidden} />
                    </div>
                    <p className="mt-1 text-sm text-muted">{localizedName(lang, category.name_ru, category.name_en)}</p>
                    <div className="mt-2 space-y-0.5 text-sm font-medium tabular-nums text-burgundy">
                      {lines.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setEditing(item)}>
                    {t.edit}
                  </Button>
                  <div className="ml-auto flex items-center gap-1.5">
                    {canReorder ? (
                      <>
                        <Button variant="secondary" size="icon" aria-label={t.moveUp} disabled={index === 0} onClick={() => move(item.id, -1)}>
                          <ChevronUp size={18} />
                        </Button>
                        <Button
                          variant="secondary"
                          size="icon"
                          aria-label={t.moveDown}
                          disabled={index === items.length - 1}
                          onClick={() => move(item.id, 1)}
                        >
                          <ChevronDown size={18} />
                        </Button>
                      </>
                    ) : null}
                    <ActionMenu
                      label={t.moreActions}
                      items={[
                        {
                          id: "toggle",
                          label: item.is_available ? t.hide : t.show,
                          onSelect: () => availabilityMutation.mutate({ id: item.id, value: !item.is_available }),
                        },
                        { id: "duplicate", label: t.duplicate, onSelect: () => duplicateMutation.mutate(item) },
                        { id: "delete", label: t.delete, tone: "danger", onSelect: () => setPendingDelete(item) },
                      ]}
                    />
                  </div>
                </div>
              </EntityCard>
            </li>
          );
        })}
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
      <Dialog
        open={Boolean(pendingDelete)}
        title={t.confirmDeleteDish}
        closeLabel={t.close}
        onClose={() => setPendingDelete(null)}
        footer={
          <DialogActions>
            <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setPendingDelete(null)}>
              {t.cancel}
            </Button>
            <Button
              className="w-full sm:w-auto"
              loading={deleteMutation.isPending}
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete)}
            >
              {t.delete}
            </Button>
          </DialogActions>
        }
      >
        <p className="font-medium text-ink">
          {pendingDelete ? localizedName(lang, pendingDelete.name_ru, pendingDelete.name_en) : ""}
        </p>
      </Dialog>
    </div>
  );
}
