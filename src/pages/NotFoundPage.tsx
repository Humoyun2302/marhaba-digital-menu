import { Link } from "react-router-dom";
import { Flourish } from "../components/Ornament";
import { buttonClass } from "../components/ui";
import { useLanguage } from "../i18n/language";

export function NotFoundPage() {
  const { t } = useLanguage();
  return (
    <div className="grid min-h-dvh place-items-center px-6 py-16 text-center">
      <div>
        <Flourish className="mx-auto mb-4 h-4 w-36 text-burgundy/80" />
        <h1 className="font-serif text-4xl text-ink">{t.notFoundTitle}</h1>
        <p className="mt-3 text-muted">{t.notFoundText}</p>
        <Link to="/" className={buttonClass("primary", "md", "mt-6")}>
          {t.backToMenu}
        </Link>
      </div>
    </div>
  );
}
