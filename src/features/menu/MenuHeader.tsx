import { Logo } from "../../components/Logo";
import { useLanguage } from "../../i18n/language";
import type { Lang } from "../../types/menu";

type MenuHeaderProps = {
  logoUrl?: string | null;
};

export function MenuHeader({ logoUrl }: MenuHeaderProps) {
  const { lang, setLang, t } = useLanguage();

  return (
    <header className="border-b border-line bg-ivory/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-[max(0.55rem,env(safe-area-inset-top))] sm:px-6">
        <a href="#top" aria-label={t.homeLabel} className="min-w-0 rounded-sm">
          <Logo variant="header" logoUrl={logoUrl} />
        </a>
        <p className="ml-auto font-serif text-xs tracking-[0.18em] text-burgundy sm:text-sm sm:tracking-[0.28em]">
          {t.menuLabel}
        </p>
        <div role="group" aria-label={t.language} className="flex">
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
      className={`h-11 min-w-11 px-2.5 text-xs font-semibold tracking-[0.14em] ${
        active ? "bg-burgundy text-ivory" : "text-burgundy"
      }`}
    >
      {label}
    </button>
  );
}
