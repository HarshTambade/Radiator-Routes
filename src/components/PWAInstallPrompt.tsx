import { useEffect, useState } from "react";
import { Download, Share, Smartphone, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = "atlas_install_prompt_dismissed_at";
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

function isStandalone() {
  const legacyNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || legacyNavigator.standalone === true;
}

function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function wasRecentlyDismissed() {
  try {
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(dismissedAt) && dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_FOR_MS;
  } catch {
    return false;
  }
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const syncInstalledState = () => {
      const standalone = isStandalone();
      setInstalled(standalone);
      if (standalone) setShowPrompt(false);
    };

    syncInstalledState();
    if (isStandalone() || wasRecentlyDismissed()) return;

    const iosDevice = isIOSDevice();
    setIsIOS(iosDevice);
    // iOS browsers do not fire beforeinstallprompt. Offer brief, manual install
    // instructions that the user can expand and dismiss themselves.
    if (iosDevice) setShowPrompt(true);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setShowPrompt(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    displayMode.addEventListener?.("change", syncInstalledState);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      displayMode.removeEventListener?.("change", syncInstalledState);
    };
  }, []);

  const dismiss = () => {
    setShowPrompt(false);
    setShowIOSGuide(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // The prompt remains dismissible when storage is unavailable.
    }
  };

  const install = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setInstalled(true);
        setShowPrompt(false);
      }
    } catch {
      // Browser install UI can be dismissed or rejected without app failure.
    } finally {
      setDeferredPrompt(null);
    }
  };

  if (installed || !showPrompt) return null;

  return (
    <aside
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] left-3 right-3 z-[45] mx-auto max-w-sm animate-slide-up md:bottom-4 md:left-auto md:right-4"
      role="dialog"
      aria-label="Install Atlas AI"
    >
      <div className="rounded-2xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <img
            src="/icons/icon-96x96.png"
            alt=""
            className="h-11 w-11 shrink-0 rounded-xl"
            width={44}
            height={44}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-card-foreground">Use Atlas like an app</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Keep trips close and open Atlas from your home screen.
                </p>
              </div>
              <button
                type="button"
                onClick={dismiss}
                className="-mr-1 -mt-1 rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Dismiss install suggestion"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {isIOS && showIOSGuide ? (
              <div className="mt-3 rounded-xl bg-secondary/70 p-3 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5 font-medium text-foreground">
                  <Share className="h-3.5 w-3.5" aria-hidden="true" />
                  In your browser, tap Share, then “Add to Home Screen”.
                </p>
                <button
                  type="button"
                  onClick={dismiss}
                  className="mt-2 font-semibold text-primary"
                >
                  Got it
                </button>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                {isIOS ? (
                  <button
                    type="button"
                    onClick={() => setShowIOSGuide(true)}
                    className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    <Smartphone className="h-4 w-4" aria-hidden="true" />
                    How to install
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={install}
                    className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Install app
                  </button>
                )}
                <button
                  type="button"
                  onClick={dismiss}
                  className="min-h-9 rounded-xl bg-secondary px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary/80"
                >
                  Later
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
