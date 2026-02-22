import { useState, useRef, useEffect, useCallback } from "react";
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

interface PanelStyle {
  top: number;
  left?: number;
  right?: number;
}

export default function LanguageSwitcher({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { lang, setLang, langInfo } = useLanguage();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"indian" | "foreign">("indian");
  const [panelStyle, setPanelStyle] = useState<PanelStyle>({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  const PANEL_W = 288;

  const calcPosition = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const top = rect.bottom + 6;
    const spaceOnRight = window.innerWidth - rect.left;
    const spaceOnLeft = rect.right;

    let style: PanelStyle;
    if (spaceOnRight >= PANEL_W + 12) {
      // Enough room to the right → left-align with button
      style = { top, left: rect.left };
    } else if (spaceOnLeft >= PANEL_W + 12) {
      // Not enough right, but enough left → right-align with button
      style = { top, right: window.innerWidth - rect.right };
    } else {
      // Fallback: centre in viewport
      style = { top, left: Math.max(8, (window.innerWidth - PANEL_W) / 2) };
    }
    setPanelStyle(style);
  }, []);

  const handleToggle = useCallback(() => {
    if (!open) calcPosition();
    setOpen((v) => !v);
  }, [open, calcPosition]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Close + unlock scroll on unmount
  useEffect(
    () => () => {
      document.body.style.overflow = "";
    },
    [],
  );

  // Lock body scroll on mobile when open
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (open && isMobile) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
  }, [open]);

  const indianLanguages = SUPPORTED_LANGUAGES.filter(
    (l) => l.code === "en" || INDIAN_LANGS.includes(l.code),
  );
  const foreignLanguages = SUPPORTED_LANGUAGES.filter((l) =>
    FOREIGN_LANGS.includes(l.code),
  );
  const displayed = tab === "indian" ? indianLanguages : foreignLanguages;

  const handleSelect = (code: string) => {
    setLang(code);
    setOpen(false);
  };

  const sharedContent = (
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
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-4 pt-3 pb-2 shrink-0">
        {(["indian", "foreign"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
              tab === t
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:bg-secondary/80"
            }`}
          >
            {t === "indian" ? "🇮🇳 Indian" : "🌍 International"}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="overflow-y-auto px-3 pb-3 space-y-0.5 flex-1 min-h-0">
        {displayed.map((language) => {
          const isSelected = lang === language.code;
          return (
            <button
              key={language.code}
              onClick={() => handleSelect(language.code)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
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

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-border bg-secondary/20 shrink-0">
        <p className="text-[10px] text-muted-foreground text-center">
          AI chat responses adapt to your selected language
        </p>
      </div>
    </>
  );

  return (
    <>
      {/* ── Trigger ── */}
      <button
        ref={btnRef}
        onClick={handleToggle}
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
            <span className="text-xs font-semibold max-w-[60px] truncate hidden sm:inline">
              {langInfo.nativeName}
            </span>
            <ChevronDown
              className={`w-3 h-3 text-muted-foreground transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
            />
          </>
        )}
      </button>

      {open && (
        <>
          {/* ── Backdrop (closes on click, both mobile & desktop) ── */}
          <div
            className="fixed inset-0 z-[198]"
            onClick={() => setOpen(false)}
            aria-hidden
          />

          {/* ── Desktop panel (md+) — smart fixed position ── */}
          <div
            className="hidden md:flex fixed flex-col bg-card border border-border rounded-2xl shadow-2xl animate-fade-in overflow-hidden z-[199]"
            style={{
              top: panelStyle.top,
              ...(panelStyle.left !== undefined
                ? { left: panelStyle.left }
                : { right: panelStyle.right }),
              width: PANEL_W,
              maxHeight: "min(480px, 80vh)",
            }}
            role="dialog"
            aria-label="Language selector"
            onClick={(e) => e.stopPropagation()}
          >
            {sharedContent}
          </div>

          {/* ── Mobile bottom-sheet (< md) ── */}
          <div
            className="md:hidden fixed inset-x-0 bottom-0 z-[199] bg-card rounded-t-3xl shadow-2xl flex flex-col animate-slide-in-from-bottom"
            style={{ maxHeight: "85vh" }}
            role="dialog"
            aria-label="Language selector"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>
            {sharedContent}
            <div
              style={{ height: "env(safe-area-inset-bottom, 0px)" }}
              className="shrink-0"
            />
          </div>
        </>
      )}
    </>
  );
}
