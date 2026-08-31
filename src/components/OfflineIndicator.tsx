import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle, CloudUpload, Loader2, RefreshCw, WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOfflineTrip";
import { useServiceWorkerUpdate } from "@/hooks/useOfflineStorage";
import { useOfflineSync } from "@/hooks/useOfflineSync";
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
  const { pending, phase, hasPending, conflicts, dismissConflicts, syncNow } =
    useOfflineSync();
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

  // Offline banner takes priority: it explains why edits aren't reaching the
  // server, which matters more than an available update.
  if (!isOnline) {
    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-destructive p-3 text-sm text-destructive-foreground md:text-base"
        role="status"
        aria-live="polite"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-2">
          <WifiOff className="h-5 w-5 flex-shrink-0 md:h-6 md:w-6" aria-hidden="true" />
          <span className="font-medium">
            Offline — showing saved trips and cached maps.
            {hasPending &&
              ` ${pending} change${pending === 1 ? "" : "s"} will sync when you reconnect.`}
          </span>
        </div>
      </div>
    );
  }

  // Dropped edits outrank the pending count: the queue is empty precisely
  // because these were discarded, so without this the user would see everything
  // go quiet and assume their change landed.
  if (conflicts.length > 0) {
    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-destructive p-3 text-sm text-destructive-foreground md:text-base"
        role="alert"
        aria-live="assertive"
      >
        <div className="mx-auto flex max-w-7xl items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-medium">
              {conflicts.length} offline change
              {conflicts.length === 1 ? "" : "s"} could not be saved — someone
              else edited the same item first.
            </p>
            <ul className="mt-1 space-y-0.5 text-xs opacity-90">
              {conflicts.slice(0, 3).map((message, index) => (
                <li key={index}>{message}</li>
              ))}
              {conflicts.length > 3 && (
                <li>and {conflicts.length - 3} more.</li>
              )}
            </ul>
          </div>
          <button
            type="button"
            onClick={dismissConflicts}
            className="rounded-full bg-destructive-foreground/15 px-3 py-1 font-semibold transition-colors hover:bg-destructive-foreground/25"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  // Online with work outstanding — surface it so unsynced edits are never silent.
  if (hasPending || phase === "syncing") {
    const syncing = phase === "syncing";
    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-warning p-3 text-sm text-warning-foreground md:text-base"
        role="status"
        aria-live="polite"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-3">
          {syncing ? (
            <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <CloudUpload className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          )}
          <span className="font-medium">
            {syncing
              ? "Syncing your offline changes…"
              : `${pending} offline change${pending === 1 ? "" : "s"} waiting to sync.`}
          </span>
          {!syncing && (
            <button
              type="button"
              onClick={syncNow}
              className="rounded-full bg-warning-foreground/15 px-3 py-1 font-semibold transition-colors hover:bg-warning-foreground/25"
            >
              Sync now
            </button>
          )}
        </div>
      </div>
    );
  }

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

  // Online, nothing queued, no update waiting — stay out of the way.
  return null;
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
