import { useState, useEffect } from "react";
import { Download, X, Smartphone, Wifi, Bell, Zap } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already installed as PWA
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }

    // Check if user dismissed previously (within 7 days)
    const dismissedAt = localStorage.getItem("pwa_dismissed_at");
    if (dismissedAt) {
      const diff = Date.now() - Number(dismissedAt);
      if (diff < 7 * 24 * 60 * 60 * 1000) {
        setDismissed(true);
        return;
      }
    }

    // Android/Chrome — capture beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS Safari detection
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /safari/i.test(navigator.userAgent) && !/chrome/i.test(navigator.userAgent);
    const isInStandalone = ("standalone" in navigator) && (navigator as any).standalone;

    if (isIOS && isSafari && !isInStandalone) {
      setShowIOSGuide(true);
      setShowBanner(true);
    }

    window.addEventListener("appinstalled", () => {
      setInstalled(true);
      setShowBanner(false);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem("pwa_dismissed_at", String(Date.now()));
  };

  if (installed || dismissed || !showBanner) return null;

  return (
    <>
      {/* Main install banner — slides up from bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-[100] animate-slide-up">
        {/* Backdrop blur strip */}
        <div className="bg-card/95 backdrop-blur-xl border-t border-border shadow-2xl rounded-t-3xl overflow-hidden">
          {/* Handle bar */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>

          <div className="px-5 pb-6 pt-2 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {/* App icon */}
                <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shrink-0 shadow-lg">
                  <span className="text-white font-black text-lg">RR</span>
                </div>
                <div>
                  <p className="font-bold text-card-foreground text-base leading-tight">
                    Install Radiator Routes
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Add to home screen for the best experience
                  </p>
                </div>
              </div>
              <button
                onClick={handleDismiss}
                className="p-1.5 rounded-full bg-secondary hover:bg-secondary/80 transition-colors shrink-0 mt-0.5"
                aria-label="Dismiss install prompt"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Feature pills */}
            <div className="flex gap-2 flex-wrap">
              {[
                { icon: Wifi, label: "Works offline" },
                { icon: Bell, label: "Notifications" },
                { icon: Zap, label: "Faster" },
                { icon: Smartphone, label: "App feel" },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/8 border border-primary/15 text-[11px] font-medium text-primary"
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </div>
              ))}
            </div>

            {/* iOS guide */}
            {showIOSGuide ? (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-card-foreground">
                  To install on iPhone / iPad:
                </p>
                <div className="space-y-2">
                  {[
                    { step: "1", text: 'Tap the Share button (□↑) in Safari' },
                    { step: "2", text: 'Scroll down and tap "Add to Home Screen"' },
                    { step: "3", text: 'Tap "Add" in the top-right corner' },
                  ].map(({ step, text }) => (
                    <div key={step} className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                        {step}
                      </div>
                      <p className="text-xs text-muted-foreground">{text}</p>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleDismiss}
                  className="w-full py-3 rounded-2xl bg-secondary text-sm font-semibold text-muted-foreground hover:bg-secondary/80 transition-colors"
                >
                  Got it
                </button>
              </div>
            ) : (
              /* Android/Chrome install button */
              <div className="flex gap-2">
                <button
                  onClick={handleInstall}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-primary/25"
                >
                  <Download className="w-4 h-4" />
                  Install App — It's Free
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-4 py-3.5 rounded-2xl bg-secondary text-sm font-semibold text-muted-foreground hover:bg-secondary/80 transition-colors"
                >
                  Later
                </button>
              </div>
            )}

            {/* Safe area padding for iOS home indicator */}
            <div className="h-safe-bottom" style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
          </div>
        </div>
      </div>

      {/* Subtle top install badge (for when user navigates away but banner was shown) */}
    </>
  );
}
