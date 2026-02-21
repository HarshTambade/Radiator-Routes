import { Download, Trash2, Loader2, CheckCircle2, WifiOff, RefreshCw } from "lucide-react";
import { useOfflineTrip } from "@/hooks/useOfflineTrip";

interface OfflineSaveButtonProps {
  trip: Record<string, unknown>;
  compact?: boolean;
  className?: string;
}

export default function OfflineSaveButton({
  trip,
  compact = false,
  className = "",
}: OfflineSaveButtonProps) {
  const {
    isSaved,
    saving,
    tileProgress,
    savedAt,
    tilesCached,
    tileCacheCount,
    saveOffline,
    removeOffline,
  } = useOfflineTrip(trip?.id as string);

  if (!trip?.id) return null;

  const progressPct =
    tileProgress && tileProgress.total > 0
      ? Math.round((tileProgress.done / tileProgress.total) * 100)
      : null;

  const savedDate = savedAt
    ? new Date(savedAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  /* ── Saving in progress ── */
  if (saving) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-medium ${className}`}
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
        {!compact && (
          <span className="truncate">
            {progressPct !== null
              ? `Caching maps… ${progressPct}%`
              : "Saving trip…"}
          </span>
        )}
        {!compact && tileProgress && (
          <div className="ml-auto w-16 h-1 rounded-full bg-primary/20 overflow-hidden shrink-0">
            <div
              className="h-full bg-primary rounded-full transition-all duration-200"
              style={{ width: `${progressPct ?? 0}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  /* ── Already saved ── */
  if (isSaved) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {/* Status badge */}
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-success/10 border border-success/20 text-success text-xs font-semibold">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          {!compact && (
            <span className="flex items-center gap-1">
              <WifiOff className="w-3 h-3 opacity-70" />
              Offline Ready
            </span>
          )}
        </div>

        {/* Re-sync button */}
        <button
          onClick={() => saveOffline(trip)}
          title="Refresh offline copy"
          className="w-8 h-8 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors shadow-card"
          aria-label="Re-sync offline copy"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        {/* Remove button */}
        <button
          onClick={removeOffline}
          title="Remove offline copy"
          className="w-8 h-8 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors shadow-card"
          aria-label="Remove offline copy"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        {/* Metadata tooltip (non-compact) */}
        {!compact && (savedDate || tilesCached) && (
          <div className="hidden lg:flex flex-col text-[10px] text-muted-foreground leading-tight">
            {savedDate && <span>Saved {savedDate}</span>}
            {tilesCached && tileCacheCount > 0 && (
              <span className="text-success/80">{tileCacheCount} map tiles cached</span>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ── Not saved ── */
  return (
    <button
      onClick={() => saveOffline(trip)}
      title="Save trip offline — stores itinerary + map tiles so you can view without internet"
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors shadow-card text-xs md:text-sm font-medium ${className}`}
    >
      <Download className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
      {!compact && <span>Save Offline</span>}
    </button>
  );
}
