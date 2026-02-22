import { useState, useRef, useEffect } from "react";
import { Globe, Check, ChevronDown, X } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { SUPPORTED_LANGUAGES } from "@/services/translate";

const INDIAN_LANGS = ["hi", "bn", "te", "mr", "ta", "gu", "kn", "ml", "pa", "ur", "or"];
const FOREIGN_LANGS = ["fr", "es", "de", "pt", "ar", "ja", "zh", "ko", "ru", "it", "tr", "th", "vi", "id", "nl", "pl", "sv"];

export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, langInfo } = useLanguage();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"indian" | "foreign">("indian");
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const indianLanguages = SUPPORTED_LANGUAGES.filter(
    (l) => l.code === "en" || INDIAN_LANGS.includes(l.code)
  );
  const foreignLanguages = SUPPORTED_LANGUAGES.filter((l) =>
    FOREIGN_LANGS.includes(l.code)
  );

  const displayed = tab === "indian" ? indianLanguages : foreignLanguages;

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Select Language"
        className={`flex items-center gap-1.5 rounded-xl border border-border bg-card text-card-foreground hover:bg-secondary transition-colors ${
          compact
            ? "px-2 py-1.5 text-xs"
            : "px-3 py-2 text-sm"
        }`}
        aria-label="Change language"
        aria-expanded={open}
      >
        <Globe className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
        <span className="font-medium">{langInfo.flag}</span>
        {!compact && (
          <>
            <span className="hidden sm:inline text-xs font-semibold">
              {langInfo.nativeName}
            </span>
            <ChevronDown
              className={`w-3 h-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            />
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-2xl shadow-elevated z-[200] animate-fade-in overflow-hidden"
          role="dialog"
          aria-label="Language selector"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" />
              <p className="text-sm font-bold text-card-foreground">
                Select Language
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg hover:bg-secondary text-muted-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Tab strip */}
          <div className="flex gap-1 px-3 pt-3 pb-2">
            <button
              onClick={() => setTab("indian")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === "indian"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              🇮🇳 Indian
            </button>
            <button
              onClick={() => setTab("foreign")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === "foreign"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              🌍 International
            </button>
          </div>

          {/* Language list */}
          <div className="max-h-64 overflow-y-auto px-3 pb-3 space-y-1">
            {displayed.map((language) => {
              const isSelected = lang === language.code;
              return (
                <button
                  key={language.code}
                  onClick={() => {
                    setLang(language.code);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                    isSelected
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "hover:bg-secondary text-card-foreground border border-transparent"
                  }`}
                >
                  <span className="text-lg leading-none">{language.flag}</span>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-semibold text-xs truncate">
                      {language.nativeName}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {language.name}
                    </p>
                  </div>
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer note */}
          <div className="px-4 py-2.5 border-t border-border bg-secondary/20">
            <p className="text-[10px] text-muted-foreground text-center">
              AI chat responses adapt to your selected language
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
