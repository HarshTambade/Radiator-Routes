import { useState, useRef, useEffect } from "react";
import { Globe, Check, ChevronDown, X } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { SUPPORTED_LANGUAGES } from "@/services/translate";

const INDIAN_LANGS = [
  "hi",
  "bn",
  "te",
  "mr",
  "ta",
  "gu",
  "kn",
  "ml",
  "pa",
  "ur",
  "or",
];
const FOREIGN_LANGS = [
  "fr",
  "es",
  "de",
  "pt",
  "ar",
  "ja",
  "zh",
  "ko",
  "ru",
  "it",
  "tr",
  "th",
  "vi",
  "id",
  "nl",
  "pl",
  "sv",
];

export default function LanguageSwitcher({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { lang, setLang, langInfo } = useLanguage();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"indian" | "foreign">("indian");
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click (desktop only; mobile uses overlay)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Lock body scroll when mobile sheet is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const indianLanguages = SUPPORTED_LANGUAGES.filter(
    (l) => l.code === "en" || INDIAN_LANGS.includes(l.code),
  );
  const foreignLanguages = SUPPORTED_LANGUAGES.filter((l) =>
    FOREIGN_LANGS.includes(l.code),
  );

  const displayed = tab === "indian" ? indianLanguages : foreignLanguages;

  return (
    <>
      <div className="relative" ref={ref}>
        {/* ── Trigger button ── */}
        <button
          onClick={() => setOpen((v) => !v)}
          title="Select Language"
          className={`flex items-center gap-1.5 rounded-xl border border-border bg-card text-card-foreground hover:bg-secondary transition-colors ${
            compact ? "px-2 py-1.5 text-xs" : "px-2.5 py-2 text-sm"
          }`}
          aria-label="Change language"
          aria-expanded={open}
        >
          <Globe
            className={compact ? "w-3.5 h-3.5 shrink-0" : "w-4 h-4 shrink-0"}
          />
          <span className="font-medium leading-none">{langInfo.flag}</span>
          {!compact && (
            <>
              <span className="text-xs font-semibold max-w-[64px] truncate">
                {langInfo.nativeName}
              </span>
              <ChevronDown
                className={`w-3 h-3 text-muted-foreground transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
              />
            </>
          )}
        </button>

        {/* ── Desktop dropdown (md+) ── */}
        {open && (
          <div
            className="hidden md:block absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-2xl shadow-elevated z-[200] animate-fade-in overflow-hidden"
            role="dialog"
            aria-label="Language selector"
          >
            <DropdownContent
              tab={tab}
              setTab={setTab}
              displayed={displayed}
              lang={lang}
              setLang={setLang}
              setOpen={setOpen}
            />
          </div>
        )}
      </div>

      {/* ── Mobile bottom-sheet (< md) ── */}
      {open && (
        <div className="md:hidden fixed inset-0 z-[300] flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          {/* Sheet */}
          <div
            className="relative bg-card rounded-t-3xl shadow-2xl w-full max-h-[85vh] flex flex-col animate-slide-in-from-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            <DropdownContent
              tab={tab}
              setTab={setTab}
              displayed={displayed}
              lang={lang}
              setLang={setLang}
              setOpen={setOpen}
              mobile
            />

            {/* Safe area spacer */}
            <div
              style={{ height: "env(safe-area-inset-bottom, 0px)" }}
              className="shrink-0"
            />
          </div>
        </div>
      )}
    </>
  );
}

/* ── Shared dropdown content ─────────────────────────────────────────────── */
function DropdownContent({
  tab,
  setTab,
  displayed,
  lang,
  setLang,
  setOpen,
  mobile = false,
}: {
  tab: "indian" | "foreign";
  setTab: (t: "indian" | "foreign") => void;
  displayed: typeof SUPPORTED_LANGUAGES;
  lang: string;
  setLang: (code: string) => void;
  setOpen: (v: boolean) => void;
  mobile?: boolean;
}) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30 shrink-0">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          <p className="text-sm font-bold text-card-foreground">
            Select Language
          </p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
          aria-label="Close language selector"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tab strip */}
      <div className="flex gap-2 px-4 pt-3 pb-2 shrink-0">
        <button
          onClick={() => setTab("indian")}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
            tab === "indian"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:bg-secondary/80"
          }`}
        >
          🇮🇳 Indian
        </button>
        <button
          onClick={() => setTab("foreign")}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
            tab === "foreign"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:bg-secondary/80"
          }`}
        >
          🌍 International
        </button>
      </div>

      {/* Language list */}
      <div
        className={`overflow-y-auto px-3 pb-3 space-y-1 ${
          mobile ? "max-h-[50vh]" : "max-h-64"
        }`}
      >
        {displayed.map((language) => {
          const isSelected = lang === language.code;
          return (
            <button
              key={language.code}
              onClick={() => {
                setLang(language.code);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all ${
                isSelected
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "hover:bg-secondary text-card-foreground border border-transparent"
              }`}
            >
              <span className="text-xl leading-none shrink-0">
                {language.flag}
              </span>
              <div className="flex-1 text-left min-w-0">
                <p className="font-semibold text-xs truncate">
                  {language.nativeName}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {language.name}
                </p>
              </div>
              {isSelected && (
                <Check className="w-4 h-4 text-primary shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* Footer note */}
      <div className="px-4 py-2.5 border-t border-border bg-secondary/20 shrink-0">
        <p className="text-[10px] text-muted-foreground text-center">
          AI chat responses adapt to your selected language
        </p>
      </div>
    </>
  );
}
