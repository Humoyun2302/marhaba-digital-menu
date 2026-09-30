import { createContext, useContext } from "react";
import type { Lang } from "../types/menu";
import type { Copy } from "./copy";

export type LanguageValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Copy;
};

export const LanguageContext = createContext<LanguageValue | null>(null);

export function useLanguage(): LanguageValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("LanguageProvider is missing");
  return value;
}
