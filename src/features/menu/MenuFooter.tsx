import { Flourish } from "../../components/Ornament";
import { Logo } from "../../components/Logo";
import { useLanguage } from "../../i18n/language";
import type { SiteSettings } from "../../types/menu";
import { localizedName } from "../../utils/format";

type MenuFooterProps = {
  settings: SiteSettings | null;
};

export function MenuFooter({ settings }: MenuFooterProps) {
  const { lang, t } = useLanguage();
  const name = settings?.restaurant_name?.trim() || "MARHABA HOTEL & SPA";
  const subtitle = settings?.subtitle?.trim();
  const address = localizedName(lang, settings?.address_ru, settings?.address_en);
  const hours = localizedName(lang, settings?.opening_hours_ru, settings?.opening_hours_en);
  const phone = settings?.phone?.trim();
  const instagram = settings?.instagram_url?.trim();

  return (
    <footer className="px-4 py-12 pb-[max(3rem,env(safe-area-inset-bottom))] text-center sm:px-6">
      <Flourish className="mx-auto mb-6 h-4 w-44 text-burgundy/70" />
      <div className="flex justify-center">
        <Logo variant="footer" logoUrl={settings?.logo_url} />
      </div>
      <p className="mt-4 font-serif text-xl tracking-[0.16em] text-ink">{name}</p>
      {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      <div className="mx-auto mt-4 max-w-sm space-y-1 text-sm text-muted">
        {address ? <p className="whitespace-pre-line">{address}</p> : null}
        {hours ? <p className="whitespace-pre-line">{hours}</p> : null}
        {phone ? (
          <p>
            <a href={`tel:${phone.replace(/\s/g, "")}`} className="underline-offset-2 hover:underline">
              {phone}
            </a>
          </p>
        ) : null}
        {instagram ? (
          <p>
            <a href={instagram} className="underline-offset-2 hover:underline" rel="noreferrer">
              {t.instagramLabel}
            </a>
          </p>
        ) : null}
      </div>
      <p className="mt-6 text-xs tracking-[0.14em] text-muted">{t.pricesNote}</p>
    </footer>
  );
}
