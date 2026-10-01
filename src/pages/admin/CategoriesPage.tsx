import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, FolderTree, GripVertical, Plus } from "lucide-react";
import { useState } from "react";
import { Dialog } from "../../components/Dialog";
import { useToast } from "../../components/toast-context";
import {
  ActionMenu,
  AdminPageHeader,
  Button,
  DialogActions,
  EmptyState,
  EntityCard,
  Field,
  FormSection,
  Select,
  SkeletonBlock,
  StatusBadge,
  Switch,
  TextInput,
} from "../../components/ui";
import {
  deleteCategory,
  fetchAdminMenu,
  saveCategory,
  saveOrder,
  setCategoryActive,
} from "../../features/admin/api";
import { useLanguage } from "../../i18n/language";
import type { Category, CategoryDraft } from "../../types/menu";
import { errorText, localizedName, slugify } from "../../utils/format";

export function CategoriesPage() {
  const { lang, t } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const menu = useQuery({ queryKey: ["admin-menu"], queryFn: fetchAdminMenu });
  const [orderedIds, setOrderedIds] = useState<string[] | null>(null);
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [removing, setRemoving] = useState<Category | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const serverRows = menu.data ?? [];
  const rows =
    orderedIds
      ?.map((id) => serverRows.find((category) => category.id === id))
      .filter((category): category is Category => Boolean(category)) ?? serverRows;
  const displayRows = rows.length === serverRows.length ? rows : serverRows;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["admin-menu"] });
    await queryClient.invalidateQueries({ queryKey: ["public-menu"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-activity"] });
  }

  const orderMutation = useMutation({
    mutationFn: (ids: string[]) => saveOrder("categories", ids),
    onSuccess: invalidate,
    onError: (error) => {
      setOrderedIds(null);
      toast.push("error", errorText(error));
    },
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, draft, slug, sortOrder }: { id: string | null; draft: CategoryDraft; slug: string; sortOrder: number }) =>
      saveCategory(id, draft, slug, sortOrder),
    onSuccess: async () => {
      setEditing(null);
      await invalidate();
      toast.push("success", t.saved);
    },
    onError: (error) => toast.push("error", errorText(error)),
  });

  const activeMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) => setCategoryActive(id, value),
    onSuccess: invalidate,
    onError: (error) => toast.push("error", errorText(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, target }: { id: string; target: string | null }) => deleteCategory(id, target),
    onSuccess: async () => {
      setRemoving(null);
      await invalidate();
      toast.push("success", t.deleted);
    },
    onError: (error) => toast.push("error", errorText(error)),
  });

  function persist(next: Category[]) {
    setOrderedIds(next.map((category) => category.id));
    orderMutation.mutate(next.map((category) => category.id));
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = displayRows.findIndex((category) => category.id === active.id);
    const newIndex = displayRows.findIndex((category) => category.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    persist(arrayMove(displayRows, oldIndex, newIndex));
  }

  function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= displayRows.length) return;
    persist(arrayMove(displayRows, index, next));
  }

  const others = displayRows.filter((category) => category.id !== removing?.id);

  return (
    <div>
      <AdminPageHeader
        title={t.categories}
        description={t.manageCategories}
        action={
          <Button className="w-full sm:w-auto" onClick={() => setEditing("new")}>
            <Plus size={18} />
            {t.addCategory}
          </Button>
        }
      />
      <p className="mt-3 text-xs text-muted">{t.reorderHint}</p>
      {menu.isLoading ? (
        <div className="mt-5 space-y-3">
          <SkeletonBlock className="h-32" />
          <SkeletonBlock className="h-32" />
          <SkeletonBlock className="h-32" />
        </div>
      ) : null}
      {menu.isError ? (
        <div className="mt-5">
          <EmptyState title={t.loadError} text={import.meta.env.DEV ? errorText(menu.error) : undefined} action={<Button onClick={() => void menu.refetch()}>{t.retry}</Button>} />
        </div>
      ) : null}
      {!menu.isLoading && !menu.isError && displayRows.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon={<FolderTree size={20} />}
            title={t.noCategories}
            action={
              <Button onClick={() => setEditing("new")}>
                <Plus size={18} />
                {t.addCategory}
              </Button>
            }
          />
        </div>
      ) : null}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={displayRows.map((category) => category.id)} strategy={verticalListSortingStrategy}>
          <ul className="mt-5 space-y-3">
            {displayRows.map((category, index) => (
              <CategoryRow
                key={category.id}
                category={category}
                lang={lang}
                label={localizedName(lang, category.name_ru, category.name_en)}
                countLabel={`${category.menu_items.length} ${t.dishesCount}`}
                onToggle={() => activeMutation.mutate({ id: category.id, value: !category.is_active })}
                onEdit={() => setEditing(category)}
                onDelete={() => {
                  const fallback = displayRows.find((entry) => entry.id !== category.id);
                  setReassignTo(fallback?.id ?? "");
                  setRemoving(category);
                }}
                onUp={() => move(index, -1)}
                onDown={() => move(index, 1)}
                disableUp={index === 0}
                disableDown={index === displayRows.length - 1}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {editing ? (
        <CategoryDialog
          key={editing === "new" ? "new" : editing.id}
          category={editing === "new" ? null : editing}
          existingSlugs={displayRows.map((category) => category.slug)}
          nextOrder={displayRows.length}
          saving={saveMutation.isPending}
          onClose={() => setEditing(null)}
          onSave={(id, draft, slug, sortOrder) => saveMutation.mutate({ id, draft, slug, sortOrder })}
        />
      ) : null}

      <Dialog
        open={Boolean(removing)}
        title={t.confirmDeleteCategory}
        closeLabel={t.close}
        onClose={() => setRemoving(null)}
        footer={
          <DialogActions>
            <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setRemoving(null)}>
              {t.cancel}
            </Button>
            <Button
              className="w-full sm:w-auto"
              loading={deleteMutation.isPending}
              disabled={Boolean(removing?.menu_items.length) && !reassignTo}
              onClick={() =>
                removing &&
                deleteMutation.mutate({
                  id: removing.id,
                  target: removing.menu_items.length ? reassignTo : null,
                })
              }
            >
              {removing?.menu_items.length ? t.moveAndDelete : t.delete}
            </Button>
          </DialogActions>
        }
      >
        <p className="font-medium text-ink">{removing ? localizedName(lang, removing.name_ru, removing.name_en) : ""}</p>
        {removing && removing.menu_items.length > 0 ? (
          <div className="mt-4">
            <p className="text-sm leading-relaxed text-burgundy">{t.deleteBlocked}</p>
            {others.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t.noOtherCategory}</p>
            ) : (
              <div className="mt-4">
                <Field label={t.reassign}>
                  <Select value={reassignTo} onChange={(event) => setReassignTo(event.target.value)}>
                    {others.map((category) => (
                      <option key={category.id} value={category.id}>
                        {localizedName(lang, category.name_ru, category.name_en)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function CategoryRow({
  category,
  label,
  countLabel,
  onToggle,
  onEdit,
  onDelete,
  onUp,
  onDown,
  disableUp,
  disableDown,
  lang,
}: {
  category: Category;
  lang: "ru" | "en";
  label: string;
  countLabel: string;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onUp: () => void;
  onDown: () => void;
  disableUp: boolean;
  disableDown: boolean;
}) {
  const { t } = useLanguage();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
  const alt = lang === "ru" ? category.name_en : category.name_ru;
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <EntityCard dragging={isDragging}>
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-line text-muted hover:bg-ivory"
            aria-label={t.drag}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold leading-snug text-ink">{label}</p>
              <StatusBadge active={category.is_active} activeLabel={t.active} inactiveLabel={t.inactive} />
            </div>
            <p className="mt-1 text-xs font-medium tracking-[0.12em] text-muted uppercase">
              {alt} · {countLabel}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onEdit}>
            {t.edit}
          </Button>
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="secondary" size="icon" aria-label={t.moveUp} disabled={disableUp} onClick={onUp}>
              <ChevronUp size={18} />
            </Button>
            <Button variant="secondary" size="icon" aria-label={t.moveDown} disabled={disableDown} onClick={onDown}>
              <ChevronDown size={18} />
            </Button>
            <ActionMenu
              label={t.moreActions}
              items={[
                { id: "toggle", label: category.is_active ? t.hide : t.show, onSelect: onToggle },
                { id: "delete", label: t.delete, tone: "danger", onSelect: onDelete },
              ]}
            />
          </div>
        </div>
      </EntityCard>
    </li>
  );
}

function CategoryDialog({
  category,
  existingSlugs,
  nextOrder,
  saving,
  onClose,
  onSave,
}: {
  category: Category | null;
  existingSlugs: string[];
  nextOrder: number;
  saving: boolean;
  onClose: () => void;
  onSave: (id: string | null, draft: CategoryDraft, slug: string, sortOrder: number) => void;
}) {
  const { t } = useLanguage();
  const [nameRu, setNameRu] = useState(category?.name_ru ?? "");
  const [nameEn, setNameEn] = useState(category?.name_en ?? "");
  const [active, setActive] = useState(category?.is_active ?? true);
  const [error, setError] = useState("");

  function submit() {
    if (!nameRu.trim() || !nameEn.trim()) {
      setError(t.invalidNames);
      return;
    }
    let slug = category?.slug ?? slugify(nameEn);
    if (!category && existingSlugs.includes(slug)) {
      let suffix = 2;
      while (existingSlugs.includes(`${slug}-${suffix}`)) suffix += 1;
      slug = `${slug}-${suffix}`;
    }
    onSave(category?.id ?? null, { name_ru: nameRu, name_en: nameEn, is_active: active }, slug, category?.sort_order ?? nextOrder);
  }

  return (
    <Dialog
      open
      title={category ? t.editCategory : t.addCategory}
      closeLabel={t.close}
      onClose={onClose}
      footer={
        <DialogActions>
          <Button variant="secondary" className="w-full sm:w-auto" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button className="w-full sm:w-auto" loading={saving} onClick={submit}>
            {saving ? t.saving : t.save}
          </Button>
        </DialogActions>
      }
    >
      <div className="space-y-4">
        <FormSection title={t.sectionBasics}>
          <Field label={t.nameRu}>
            <TextInput value={nameRu} onChange={(event) => setNameRu(event.target.value)} />
          </Field>
          <Field label={t.nameEn}>
            <TextInput value={nameEn} onChange={(event) => setNameEn(event.target.value)} />
          </Field>
        </FormSection>
        <FormSection title={t.sectionVisibility}>
          <Switch checked={active} onChange={setActive} label={t.active} />
        </FormSection>
        {error ? <p className="text-sm text-burgundy">{error}</p> : null}
      </div>
    </Dialog>
  );
}
