import { Logo } from "../../components/Logo";
import { useLanguage } from "../../i18n/language";
import type { Lang } from "../../types/menu";

export function MenuHeader({ logoUrl }: { logoUrl?: string | null }) {
  const { lang, setLang, t } = useLanguage();

  return (
    <header className="rounded-xl border border-line bg-paper px-4 py-4 shadow-[var(--shadow-soft)] sm:px-5">
      <div className="flex items-center gap-3">
        <a href="#top" aria-label={t.homeLabel} className="min-w-0 rounded-md">
          <Logo variant="header" logoUrl={logoUrl} />
        </a>
        <p className="ml-auto font-serif text-sm tracking-[0.22em] text-burgundy">{t.menuLabel}</p>
        <div role="group" aria-label={t.language} className="flex rounded-full bg-ivory p-1">
          <LangButton current={lang} value="ru" label="RU" onSelect={setLang} />
          <LangButton current={lang} value="en" label="EN" onSelect={setLang} />
        </div>
      </div>
    </header>
  );
}

function LangButton({
  current,
  value,
  label,
  onSelect,
}: {
  current: Lang;
  value: Lang;
  label: string;
  onSelect: (lang: Lang) => void;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onSelect(value)}
      className={`h-9 min-w-11 rounded-full px-3 text-xs font-semibold tracking-[0.12em] ${
        active ? "bg-burgundy text-ivory shadow-sm" : "text-muted hover:text-wine"
      }`}
    >
      {label}
    </button>
  );
}
