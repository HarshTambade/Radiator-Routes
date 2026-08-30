import { useEffect, useRef, type ReactNode } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOfflineTrip";
import { useServiceWorkerUpdate } from "@/hooks/useOfflineStorage";
import { useToast } from "@/hooks/use-toast";

/**
 * Persistent connectivity banner plus a "new version available" prompt.
 *
 * Online/offline state comes from `useOnlineStatus` so the whole app shares a
 * single source of truth rather than each component attaching its own
 * online/offline listeners.
 */
export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const { hasUpdate, update } = useServiceWorkerUpdate();
  const { toast } = useToast();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true;
      toast({
        title: "You're offline",
        description: "Saved trips and cached maps still work. Changes sync when you reconnect.",
        variant: "destructive",
      });
      return;
    }

    // Only announce reconnection to users who actually dropped off.
    if (wasOffline.current) {
      wasOffline.current = false;
      toast({
        title: "Back online",
        description: "Live data and syncing have resumed.",
      });
    }
  }, [isOnline, toast]);

  if (hasUpdate) {
    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-primary p-3 text-sm text-primary-foreground md:text-base"
        role="status"
        aria-live="polite"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-3">
          <span className="font-medium">A new version of Radiator Routes is ready.</span>
          <button
            type="button"
            onClick={update}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1 font-semibold transition-colors hover:bg-primary-foreground/25"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Reload
          </button>
        </div>
      </div>
    );
  }

  if (isOnline) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-destructive p-3 text-sm text-destructive-foreground md:text-base"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2">
        <WifiOff className="h-5 w-5 flex-shrink-0 md:h-6 md:w-6" aria-hidden="true" />
        <span className="font-medium">Offline — showing saved trips and cached maps.</span>
      </div>
    </div>
  );
}

/**
 * Renders `fallback` instead of `children` while the device is offline. Use for
 * panels that are meaningless without a live network call.
 */
export function OfflineAware({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const isOnline = useOnlineStatus();
  if (!isOnline && fallback) return <>{fallback}</>;
  return <>{children}</>;
}

export default OfflineIndicator;
