import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../../components/toast-context";
import { AdminPageHeader, Button, buttonClass, Field, FormSection, TextArea, TextInput } from "../../components/ui";
import { fetchAdminMenu, removeImage, saveSettings } from "../../features/admin/api";
import { fetchSettings } from "../../features/menu/api";
import { adminDishPhoto } from "../../features/menu/photos";
import type { MenuItem } from "../../types/menu";
import { fetchQrBoard } from "../../features/qr/api";
import { useLanguage } from "../../i18n/language";
import { supabase } from "../../lib/supabase";
import type { SettingsDraft } from "../../types/menu";
import { errorText, isHttpUrl } from "../../utils/format";
import { compressImage, uploadWithProgress, validateImageFile } from "../../utils/image";

export function SettingsPage() {
  const { t } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
  const menu = useQuery({ queryKey: ["admin-menu"], queryFn: fetchAdminMenu });
  const qr = useQuery({ queryKey: ["qr-board"], queryFn: fetchQrBoard });
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  if (settings.isSuccess && !draft) {
    const current = settings.data;
    setDraft({
      restaurant_name: current?.restaurant_name ?? "MARHABA HOTEL & SPA",
      subtitle: current?.subtitle ?? "",
      logo_url: current?.logo_url ?? null,
      phone: current?.phone ?? "",
      address_ru: current?.address_ru ?? "",
      address_en: current?.address_en ?? "",
      instagram_url: current?.instagram_url ?? "",
      opening_hours_ru: current?.opening_hours_ru ?? "",
      opening_hours_en: current?.opening_hours_en ?? "",
    });
  }

  const saveMutation = useMutation({
    mutationFn: (next: SettingsDraft) => saveSettings(settings.data ?? null, next),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.push("success", t.saved);
    },
    onError: (saveError) => {
      setError(errorText(saveError));
      toast.push("error", t.saveError);
    },
  });

  async function onFile(file: File | undefined) {
    if (!file || !draft || !supabase) return;
    if (validateImageFile(file)) {
      setError(t.invalidImage);
      return;
    }
    setProgress(0.05);
    setError("");
    try {
      const prepared = await compressImage(file);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error(t.unauthorized);
      const url = await uploadWithProgress({
        bucket: "branding",
        path: `${crypto.randomUUID()}.${prepared.extension}`,
        blob: prepared.blob,
        contentType: prepared.contentType,
        accessToken: token,
        onProgress: setProgress,
      });
      if (draft.logo_url) await removeImage(draft.logo_url, "branding");
      setDraft({ ...draft, logo_url: url });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t.uploadError);
    } finally {
      setProgress(null);
    }
  }

  function submit() {
    if (!draft) return;
    if (draft.instagram_url.trim() && !isHttpUrl(draft.instagram_url.trim())) {
      setError(t.invalidUrl);
      return;
    }
    setError("");
    saveMutation.mutate(draft);
  }

  if (settings.isLoading || !draft) return <div className="h-40 animate-pulse rounded-[24px] bg-paper" />;
  if (settings.isError) return <p className="text-burgundy">{t.loadError}</p>;

  return (
    <div className="max-w-2xl">
      <AdminPageHeader title={t.settings} description={t.manageSettings} />
      <div className="mt-6 space-y-4">
        <FormSection title={t.sectionAbout}>
          <Field label={t.restaurantName}>
            <TextInput value={draft.restaurant_name} onChange={(event) => setDraft({ ...draft, restaurant_name: event.target.value })} />
          </Field>
          <Field label={t.subtitle} hint={t.optional}>
            <TextInput value={draft.subtitle} onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })} />
          </Field>
          <div>
            <p className="text-sm font-medium text-ink">{t.logo}</p>
            {draft.logo_url ? (
              <img src={draft.logo_url} alt="" className="mt-3 h-16 w-auto rounded-[12px] bg-paper object-contain" />
            ) : (
              <div className="mt-3 grid h-20 place-items-center rounded-[16px] border border-dashed border-line bg-paper text-muted">
                <ImagePlus size={20} />
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <label className={buttonClass("secondary", "sm", "cursor-pointer")}>
                {draft.logo_url ? t.changeImage : t.upload}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void onFile(event.target.files?.[0])} />
              </label>
              {draft.logo_url ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    void removeImage(draft.logo_url, "branding");
                    setDraft({ ...draft, logo_url: null });
                  }}
                >
                  {t.removeImage}
                </Button>
              ) : null}
            </div>
            {progress !== null ? (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-burgundy" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            ) : null}
          </div>
        </FormSection>

        <FormSection title={t.sectionContact}>
          <Field label={t.phone} hint={t.optional}>
            <TextInput value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
          </Field>
          <Field label={t.addressRu} hint={t.optional}>
            <TextArea rows={3} value={draft.address_ru} onChange={(event) => setDraft({ ...draft, address_ru: event.target.value })} />
          </Field>
          <Field label={t.addressEn} hint={t.optional}>
            <TextArea rows={3} value={draft.address_en} onChange={(event) => setDraft({ ...draft, address_en: event.target.value })} />
          </Field>
          <Field label={t.instagram} hint={t.optional}>
            <TextInput value={draft.instagram_url} onChange={(event) => setDraft({ ...draft, instagram_url: event.target.value })} />
          </Field>
        </FormSection>

        <FormSection title={t.sectionHours}>
          <Field label={t.hoursRu} hint={t.optional}>
            <TextArea rows={3} value={draft.opening_hours_ru} onChange={(event) => setDraft({ ...draft, opening_hours_ru: event.target.value })} />
          </Field>
          <Field label={t.hoursEn} hint={t.optional}>
            <TextArea rows={3} value={draft.opening_hours_en} onChange={(event) => setDraft({ ...draft, opening_hours_en: event.target.value })} />
          </Field>
        </FormSection>

        <FormSection title={t.sectionMenuPrefs}>
          <p className="text-sm leading-relaxed text-muted">{t.menuPrefsText}</p>
        </FormSection>
        <FormSection title={t.sectionQrSettings}>
          <p className="text-sm leading-relaxed text-muted">
            {settings.data?.qr_domain_locked && settings.data.qr_domain ? t.qrDomainLocked : t.qrDomainWarning}
          </p>
          {settings.data?.qr_domain ? <p className="break-all text-sm font-medium text-ink">{settings.data.qr_domain}</p> : null}
          {qr.data?.ready && qr.data.overview ? (
            <p className="text-sm text-ink">
              {t.qrInstalled}: {qr.data.overview.installed} · {t.qrNotInstalled}: {qr.data.overview.not_installed} · {t.qrScans}: {qr.data.overview.scans}
            </p>
          ) : (
            <p className="text-sm text-muted">{t.qrSetupText}</p>
          )}
          <Link to="/admin/qr" className={buttonClass("secondary", "sm")}>{t.qrOpenAdmin}</Link>
        </FormSection>
        <FormSection title={t.sectionImageSettings}>
          <ImageCoverage items={menu.data?.flatMap((category) => category.menu_items) ?? []} />
          <Link to="/admin/images" className={buttonClass("secondary", "sm")}>{t.imagesOpenAdmin}</Link>
        </FormSection>

        {error ? <p className="text-sm text-burgundy">{error}</p> : null}
        <Button className="w-full sm:w-auto" loading={saveMutation.isPending} disabled={progress !== null} onClick={submit}>
          {saveMutation.isPending ? t.saving : t.save}
        </Button>
      </div>
    </div>
  );
}

function ImageCoverage({ items }: { items: MenuItem[] }) {
  const { t } = useLanguage();
  const approved = items.filter((item) => adminDishPhoto(item)?.review === "approved").length;
  const review = items.filter((item) => adminDishPhoto(item)?.review === "needs_review").length;
  const missing = Math.max(0, items.length - approved - review);
  return (
    <p className="text-sm text-ink">
      {t.imageWith}: {approved} · {t.imageMissing}: {missing} · {t.imageReview}: {review}
    </p>
  );
}
