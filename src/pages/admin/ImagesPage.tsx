import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useToast } from "../../components/toast-context";
import { AdminPageHeader, Button, buttonClass, EmptyState, SearchField, Select } from "../../components/ui";
import { fetchAdminMenu, removeImage, updateItemImage } from "../../features/admin/api";
import { uploadDishPhoto } from "../../features/admin/upload-photo";
import { adminDishPhoto, bundledPhotos, manualReview } from "../../features/menu/photos";
import { useLanguage } from "../../i18n/language";
import { supabase } from "../../lib/supabase";
import type { MenuItem } from "../../types/menu";
import { errorText, localizedName } from "../../utils/format";
import { validateImageFile } from "../../utils/image";

export function ImagesPage() {
  const { lang, t } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const menu = useQuery({ queryKey: ["admin-menu"], queryFn: fetchAdminMenu });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return (menu.data ?? []).flatMap((category) =>
      category.menu_items
        .map((item) => ({ item, category, photo: adminDishPhoto(item) }))
        .filter(({ item, photo }) => {
          const name = `${item.name_ru} ${item.name_en}`.toLocaleLowerCase();
          if (needle && !name.includes(needle)) return false;
          if (filter === "missing") return !photo;
          if (filter === "review") return photo?.review === "needs_review";
          if (filter === "approved") return photo?.review === "approved";
          return true;
        }),
    );
  }, [filter, menu.data, search]);

  const allItems = menu.data?.flatMap((category) => category.menu_items) ?? [];
  const approved = allItems.filter((item) => adminDishPhoto(item)?.review === "approved").length;
  const review = allItems.filter((item) => adminDishPhoto(item)?.review === "needs_review").length;
  const missing = Math.max(0, allItems.length - approved - review);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["admin-menu"] });
    await queryClient.invalidateQueries({ queryKey: ["public-menu"] });
  }

  const mutation = useMutation({
    mutationFn: async ({ id, patch, previous }: { id: string; patch: Parameters<typeof updateItemImage>[1]; previous: MenuItem }) => {
      await updateItemImage(id, patch);
      if (previous.image_url && previous.image_url !== patch.image_url) await removeImage(previous.image_url, "menu-images");
      if (previous.image_thumb_url && previous.image_thumb_url !== patch.image_thumb_url) await removeImage(previous.image_thumb_url, "menu-images");
    },
    onSuccess: async () => {
      await refresh();
      toast.push("success", t.saved);
    },
    onError: (error) => {
      toast.push("error", error instanceof Error && error.message === "MIGRATION_REQUIRED" ? t.migrationRequired : errorText(error));
    },
    onSettled: () => setBusyId(null),
  });

  async function onFile(item: MenuItem, file: File | undefined) {
    if (!file || !supabase) return;
    if (validateImageFile(file)) {
      toast.push("error", t.invalidImage);
      return;
    }
    setBusyId(item.id);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error(t.unauthorized);
      const uploaded = await uploadDishPhoto(file, token, () => undefined);
      mutation.mutate({
        id: item.id,
        previous: item,
        patch: {
          image_url: uploaded.image_url,
          image_thumb_url: uploaded.image_thumb_url,
          image_source: lang === "ru" ? "Загружено администратором" : "Uploaded by an administrator",
          image_license: "Restaurant",
          image_attribution: null,
          image_review_status: "approved",
          image_hidden: false,
        },
      });
    } catch (error) {
      setBusyId(null);
      toast.push("error", errorText(error));
    }
  }

  function clearImage(item: MenuItem) {
    setBusyId(item.id);
    mutation.mutate({
      id: item.id,
      previous: item,
      patch: {
        image_url: null,
        image_thumb_url: null,
        image_source: null,
        image_license: null,
        image_attribution: null,
        image_review_status: null,
        image_hidden: true,
      },
    });
  }

  function approveBundled(item: MenuItem) {
    const bundled = bundledPhotos[item.id];
    if (!bundled) return;
    setBusyId(item.id);
    mutation.mutate({
      id: item.id,
      previous: item,
      patch: {
        image_url: bundled.detail,
        image_thumb_url: bundled.card,
        image_source: bundled.sourceUrl,
        image_license: bundled.license,
        image_attribution: bundled.attribution,
        image_review_status: "approved",
        image_hidden: false,
      },
    });
  }

  if (menu.isLoading) return <div className="h-40 animate-pulse rounded-[24px] bg-paper" />;
  if (menu.isError) return <EmptyState title={t.loadError} text={errorText(menu.error)} action={<Button onClick={() => void menu.refetch()}>{t.retry}</Button>} />;

  return (
    <div>
      <AdminPageHeader title={t.imagesTitle} description={t.imagesSubtitle} />
      <div className="mt-6 grid grid-cols-3 gap-3">
        <MiniStat label={t.imageWith} value={approved} />
        <MiniStat label={t.imageMissing} value={missing} />
        <MiniStat label={t.imageReview} value={review} />
      </div>
      {manualReview.length > 0 ? (
        <section className="mt-4 rounded-[24px] border border-line bg-paper p-4 shadow-[var(--shadow-soft)] sm:p-5">
          <h2 className="font-serif text-2xl text-ink">{t.reviewReason}</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            {manualReview.map((note) => {
              const item = allItems.find((entry) => entry.id === note.id);
              const name = item ? localizedName(lang, item.name_ru, item.name_en) : note.id;
              return <li key={note.id}><span className="font-medium text-ink">{name}.</span> {lang === "ru" ? note.reasonRu : note.reasonEn}</li>;
            })}
          </ul>
        </section>
      ) : null}
      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
        <SearchField value={search} onChange={setSearch} placeholder={t.searchDishes} label={t.searchDishes} clearLabel={t.clearSearch} onClear={() => setSearch("")} />
        <Select aria-label={t.allPhotos} value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">{t.allPhotos}</option>
          <option value="missing">{t.imageMissing}</option>
          <option value="review">{t.imageReview}</option>
          <option value="approved">{t.imageApproved}</option>
        </Select>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ item, category, photo }) => (
          <article key={item.id} className="overflow-hidden rounded-[22px] border border-line bg-paper shadow-[var(--shadow-soft)]">
            <div className="aspect-[4/3] bg-[#f3eadf]">
              {photo ? <img src={photo.card} alt="" className="h-full w-full object-cover" /> : <div className="photo-fallback grid h-full place-items-center font-serif text-3xl text-burgundy/30">M</div>}
            </div>
            <div className="space-y-2 p-4">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">{localizedName(lang, category.name_ru, category.name_en)}</p>
              <h2 className="font-serif text-2xl leading-tight text-ink">{localizedName(lang, item.name_ru, item.name_en)}</h2>
              <p className="text-xs text-muted">{photo ? (photo.review === "needs_review" ? t.imageReview : t.imageApproved) : t.imageNone}</p>
              {photo?.attribution ? <p className="text-xs leading-relaxed text-muted">{t.imageAdminSource}: {photo.attribution}</p> : null}
              {photo?.license ? <p className="text-xs text-muted">{t.imageAdminLicense}: {photo.license}</p> : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <label className={buttonClass("secondary", "sm", "cursor-pointer")}>
                  {photo ? t.changeImage : t.upload}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busyId === item.id} onChange={(event) => void onFile(item, event.target.files?.[0])} />
                </label>
                {photo ? <Button size="sm" variant="danger" disabled={busyId === item.id} onClick={() => clearImage(item)}>{t.removeImage}</Button> : null}
                {photo?.review === "needs_review" && photo.origin === "bundled" ? (
                  <Button size="sm" disabled={busyId === item.id} onClick={() => approveBundled(item)}>{t.approvePhoto}</Button>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[22px] border border-line bg-paper p-3 shadow-[var(--shadow-soft)] sm:p-4">
      <p className="text-[10px] font-semibold tracking-[0.12em] text-muted uppercase sm:text-[11px]">{label}</p>
      <p className="mt-1 font-serif text-3xl leading-none text-ink sm:text-4xl">{value}</p>
    </div>
  );
}
