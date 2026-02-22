import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bell,
  BellOff,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Timer,
  RefreshCw,
  X,
  CalendarClock,
  Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Activity {
  id: string;
  name: string;
  start_time: string;
  end_time?: string | null;
  location_name?: string | null;
  category?: string | null;
  cost?: number | null;
}

interface Props {
  activities: Activity[];
  tripName: string;
}

type ActivityStatus = "upcoming" | "imminent" | "active" | "late" | "done";

interface ActivityWithStatus extends Activity {
  status: ActivityStatus;
  minutesUntil: number;
  minutesPast: number;
  delayMinutes: number; // 0 = on time, >0 = delayed by N minutes
}

const STATUS_CONFIG: Record<
  ActivityStatus,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  upcoming: {
    label: "Upcoming",
    color: "text-muted-foreground",
    bg: "bg-secondary",
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  imminent: {
    label: "Starting Soon",
    color: "text-warning",
    bg: "bg-warning/10",
    icon: <Timer className="w-3.5 h-3.5" />,
  },
  active: {
    label: "In Progress",
    color: "text-success",
    bg: "bg-success/10",
    icon: <Zap className="w-3.5 h-3.5" />,
  },
  late: {
    label: "Running Late",
    color: "text-destructive",
    bg: "bg-destructive/10",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  done: {
    label: "Done",
    color: "text-muted-foreground",
    bg: "bg-secondary/50",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
};

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function ItineraryNotifications({ activities, tripName }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [delayOffsets, setDelayOffsets] = useState<Record<string, number>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0);
  const notifiedRef = useRef<Set<string>>(new Set());
  const permissionAsked = useRef(false);

  // Tick every 30 seconds to refresh statuses
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Request notification permission
  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) {
      toast({
        title: "Notifications not supported",
        description: "Your browser doesn't support push notifications.",
        variant: "destructive",
      });
      return false;
    }
    if (Notification.permission === "granted") return true;
    const result = await Notification.requestPermission();
    return result === "granted";
  }, [toast]);

  const enableNotifications = useCallback(async () => {
    const granted = await requestPermission();
    if (granted) {
      setNotifEnabled(true);
      toast({
        title: "🔔 Notifications enabled",
        description: "You'll get alerts before each activity starts.",
      });
    } else {
      toast({
        title: "Permission denied",
        description: "Allow notifications in your browser settings.",
        variant: "destructive",
      });
    }
  }, [requestPermission, toast]);

  // Compute live statuses
  const now = new Date();

  const enriched: ActivityWithStatus[] = activities
    .filter((a) => a.start_time)
    .map((a) => {
      const delay = delayOffsets[a.id] ?? 0;
      const startMs = new Date(a.start_time).getTime() + delay * 60_000;
      const endMs = a.end_time
        ? new Date(a.end_time).getTime() + delay * 60_000
        : startMs + 60 * 60_000;

      const diffStart = Math.round((startMs - now.getTime()) / 60_000);
      const diffEnd = Math.round((endMs - now.getTime()) / 60_000);

      let status: ActivityStatus;
      if (diffEnd < 0) status = "done";
      else if (diffStart <= 0 && diffEnd >= 0) {
        // Started — check if past start by more than 15 min
        status = -diffStart > 15 ? "late" : "active";
      } else if (diffStart <= 15) status = "imminent";
      else status = "upcoming";

      return {
        ...a,
        status,
        minutesUntil: Math.max(0, diffStart),
        minutesPast: Math.max(0, -diffStart),
        delayMinutes: delay,
      };
    })
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    );

  // Fire browser notifications
  useEffect(() => {
    if (!notifEnabled) return;
    enriched.forEach((a) => {
      const key15 = `${a.id}-15`;
      const key5 = `${a.id}-5`;
      const keyStart = `${a.id}-start`;

      if (
        a.status === "imminent" &&
        a.minutesUntil <= 15 &&
        a.minutesUntil > 5 &&
        !notifiedRef.current.has(key15)
      ) {
        notifiedRef.current.add(key15);
        if (Notification.permission === "granted") {
          new Notification(`⏰ ${a.name} in 15 min`, {
            body: `${tripName} · ${fmt(a.start_time)}${a.location_name ? " · " + a.location_name : ""}`,
            icon: "/favicon.ico",
            tag: key15,
          });
        }
      }

      if (
        a.status === "imminent" &&
        a.minutesUntil <= 5 &&
        !notifiedRef.current.has(key5)
      ) {
        notifiedRef.current.add(key5);
        if (Notification.permission === "granted") {
          new Notification(`🚀 ${a.name} starts in ${a.minutesUntil}m!`, {
            body: `Heads up — get ready!${a.location_name ? " · " + a.location_name : ""}`,
            icon: "/favicon.ico",
            tag: key5,
          });
        }
      }

      if (
        a.status === "active" &&
        a.minutesPast <= 2 &&
        !notifiedRef.current.has(keyStart)
      ) {
        notifiedRef.current.add(keyStart);
        if (Notification.permission === "granted") {
          new Notification(`✅ ${a.name} has started!`, {
            body: a.location_name ?? tripName,
            icon: "/favicon.ico",
            tag: keyStart,
          });
        }
      }
    });
  }, [tick, notifEnabled, enriched, tripName]);

  // ── Delay all future activities ─────────────────────────────────────────
  const handleLate = useCallback(
    (delayMins: number) => {
      const upcoming = enriched.filter(
        (a) => a.status === "upcoming" || a.status === "imminent",
      );
      const updates: Record<string, number> = { ...delayOffsets };
      upcoming.forEach((a) => {
        updates[a.id] = (updates[a.id] ?? 0) + delayMins;
      });
      setDelayOffsets(updates);
      toast({
        title: `⏱️ Timeline adjusted +${delayMins} min`,
        description: `${upcoming.length} upcoming activit${upcoming.length === 1 ? "y" : "ies"} rescheduled.`,
      });
    },
    [enriched, delayOffsets, toast],
  );

  // ── Reset all delays ─────────────────────────────────────────────────────
  const resetDelays = useCallback(() => {
    setDelayOffsets({});
    toast({ title: "🔄 Timeline reset to original schedule." });
  }, [toast]);

  const lateCount = enriched.filter((a) => a.status === "late").length;
  const imminentCount = enriched.filter((a) => a.status === "imminent").length;
  const activeCount = enriched.filter((a) => a.status === "active").length;
  const hasAlerts = lateCount + imminentCount + activeCount > 0;
  const totalDelay = Object.values(delayOffsets).reduce(
    (s, v) => Math.max(s, v),
    0,
  );

  if (activities.length === 0) return null;

  return (
    <>
      {/* ── Trigger button ── */}
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
            hasAlerts
              ? "border-warning bg-warning/10 text-warning animate-pulse"
              : "border-border bg-card text-card-foreground hover:bg-secondary"
          }`}
          title="Itinerary Notifications & Timeline"
        >
          {notifEnabled ? (
            <Bell className="w-4 h-4" />
          ) : (
            <BellOff className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">Timeline</span>
          {hasAlerts && (
            <span className="w-2 h-2 rounded-full bg-warning shrink-0" />
          )}
        </button>

        {/* ── Panel ── */}
        {open && (
          <div className="absolute right-0 top-full mt-2 w-[340px] sm:w-[380px] bg-card border border-border rounded-2xl shadow-elevated z-[100] animate-fade-in overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-primary" />
                <p className="text-sm font-bold text-card-foreground">
                  Timeline Manager
                </p>
                {totalDelay > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-warning/20 text-warning text-[10px] font-bold">
                    +{fmtMins(totalDelay)} delay
                  </span>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg hover:bg-secondary text-muted-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Alert strip */}
            {hasAlerts && (
              <div
                className={`px-4 py-2.5 flex items-center gap-2 text-xs font-semibold ${
                  lateCount > 0
                    ? "bg-destructive/10 text-destructive"
                    : imminentCount > 0
                      ? "bg-warning/10 text-warning"
                      : "bg-success/10 text-success"
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {lateCount > 0
                  ? `You're running late on ${lateCount} activit${lateCount > 1 ? "ies" : "y"}!`
                  : imminentCount > 0
                    ? `${imminentCount} activit${imminentCount > 1 ? "ies" : "y"} starting soon`
                    : `${activeCount} activit${activeCount > 1 ? "ies" : "y"} in progress`}
              </div>
            )}

            {/* Notification toggle */}
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-card-foreground">
                  Push Notifications
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Alerts 15 min & 5 min before each activity
                </p>
              </div>
              <button
                onClick={notifEnabled ? () => setNotifEnabled(false) : enableNotifications}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  notifEnabled
                    ? "bg-success/10 text-success border border-success/20"
                    : "bg-primary text-primary-foreground"
                }`}
              >
                {notifEnabled ? "✓ On" : "Enable"}
              </button>
            </div>

            {/* Late management */}
            {(lateCount > 0 || imminentCount > 0) && (
              <div className="px-4 py-3 border-b border-border bg-warning/5">
                <p className="text-xs font-bold text-card-foreground mb-2">
                  🏃 Running Late? Adjust Timeline
                </p>
                <div className="flex flex-wrap gap-2">
                  {[10, 15, 20, 30, 45, 60].map((mins) => (
                    <button
                      key={mins}
                      onClick={() => handleLate(mins)}
                      className="px-3 py-1.5 rounded-lg bg-warning/15 text-warning text-xs font-semibold hover:bg-warning/25 transition-colors border border-warning/20"
                    >
                      +{mins}m
                    </button>
                  ))}
                </div>
                {totalDelay > 0 && (
                  <button
                    onClick={resetDelays}
                    className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Reset to original schedule
                  </button>
                )}
              </div>
            )}

            {/* Activity list */}
            <div className="max-h-72 overflow-y-auto divide-y divide-border">
              {enriched.map((a) => {
                if (dismissed.has(a.id)) return null;
                const cfg = STATUS_CONFIG[a.status];
                const adjustedStart = a.delayMinutes
                  ? new Date(
                      new Date(a.start_time).getTime() +
                        a.delayMinutes * 60_000,
                    ).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : null;

                return (
                  <div key={a.id} className="px-4 py-3 flex items-start gap-3">
                    <div
                      className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg} ${cfg.color}`}
                    >
                      {cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-xs font-semibold text-card-foreground truncate">
                          {a.name}
                        </p>
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${cfg.bg} ${cfg.color}`}
                        >
                          {cfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-muted-foreground">
                          {adjustedStart ? (
                            <>
                              <span className="line-through opacity-50">
                                {fmt(a.start_time)}
                              </span>{" "}
                              <span className="text-warning font-semibold">
                                {adjustedStart}
                              </span>
                            </>
                          ) : (
                            fmt(a.start_time)
                          )}
                        </span>
                        {a.location_name && (
                          <span className="text-[10px] text-muted-foreground truncate">
                            · {a.location_name}
                          </span>
                        )}
                      </div>
                      {a.status === "upcoming" && a.minutesUntil > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Starts in{" "}
                          <span className="font-semibold text-foreground">
                            {fmtMins(a.minutesUntil)}
                          </span>
                        </p>
                      )}
                      {a.status === "imminent" && (
                        <p className="text-[10px] text-warning font-semibold mt-0.5">
                          ⚡ Starting in {fmtMins(a.minutesUntil)}!
                        </p>
                      )}
                      {a.status === "late" && (
                        <p className="text-[10px] text-destructive font-semibold mt-0.5">
                          ⚠️ {fmtMins(a.minutesPast)} behind schedule
                        </p>
                      )}
                      {a.status === "active" && (
                        <p className="text-[10px] text-success font-semibold mt-0.5">
                          ✅ Started {fmtMins(a.minutesPast)} ago
                        </p>
                      )}
                    </div>
                    {a.status === "done" && (
                      <button
                        onClick={() =>
                          setDismissed((prev) => new Set([...prev, a.id]))
                        }
                        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        title="Dismiss"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    {(a.status === "upcoming" || a.status === "imminent") && (
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-border bg-secondary/20">
              <p className="text-[10px] text-muted-foreground text-center">
                {enriched.filter((a) => a.status === "done").length} done ·{" "}
                {enriched.filter((a) => a.status === "active").length} active ·{" "}
                {
                  enriched.filter(
                    (a) => a.status === "upcoming" || a.status === "imminent",
                  ).length
                }{" "}
                upcoming
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
