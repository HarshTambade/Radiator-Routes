import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import {
  getSavedLanguage,
  saveLanguage,
  getUIBundle,
  getLanguageInfo,
  type UIStringKey,
  type Language,
  SUPPORTED_LANGUAGES,
} from "@/services/translate";

interface LanguageContextValue {
  lang: string;
  setLang: (code: string) => void;
  t: (key: UIStringKey) => string;
  langInfo: Language;
  languages: Language[];
  isRTL: boolean;
}

const RTL_LANGS = new Set(["ar", "ur", "he", "fa"]);

const LanguageContext = createContext<LanguageContextValue>({
  lang: "en",
  setLang: () => {},
  t: (key) => key,
  langInfo: SUPPORTED_LANGUAGES[0],
  languages: SUPPORTED_LANGUAGES,
  isRTL: false,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<string>(() => getSavedLanguage());

  const bundle = getUIBundle(lang);
  const langInfo = getLanguageInfo(lang);
  const isRTL = RTL_LANGS.has(lang);

  // Apply RTL direction to document
  useEffect(() => {
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [lang, isRTL]);

  const setLang = useCallback((code: string) => {
    saveLanguage(code);
    setLangState(code);
  }, []);

  const t = useCallback(
    (key: UIStringKey): string => {
      return bundle[key] || key;
    },
    [bundle],
  );

  return (
    <LanguageContext.Provider
      value={{ lang, setLang, t, langInfo, languages: SUPPORTED_LANGUAGES, isRTL }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
