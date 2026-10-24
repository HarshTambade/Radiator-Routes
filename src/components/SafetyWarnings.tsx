import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  AlertTriangle,
  AlertOctagon,
  Info,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  MapPin,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Newspaper,
} from "lucide-react";
import {
  fetchSafetyAlerts,
  type SafetyAlert,
  SEVERITY_CONFIG,
  formatRelativeTime,
} from "@/services/gnews";

interface SafetyWarningsProps {
  destination: string;
  autoFetch?: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  crime: "Crime",
  kidnapping: "Kidnapping",
  drugs: "Drug Activity",
  sexual_violence: "Sexual Violence",
  terrorism: "Terrorism",
  natural_disaster: "Natural Disaster",
  political_unrest: "Civil Unrest",
  scam: "Tourist Scam",
  general: "General Alert",
};

function SeverityIcon({ severity }: { severity: SafetyAlert["severity"] }) {
  if (severity === "critical")
    return <AlertOctagon className="w-4 h-4 text-red-600" />;
  if (severity === "high")
    return <AlertTriangle className="w-4 h-4 text-orange-500" />;
  if (severity === "medium")
    return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
  return <Info className="w-4 h-4 text-blue-500" />;
}

function AlertCard({ alert }: { alert: SafetyAlert }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SEVERITY_CONFIG[alert.severity];

  return (
    <div
      className={`rounded-xl border p-3 ${cfg.bg} ${cfg.border} transition-all`}
    >
      <div className="flex items-start gap-2.5">
        <span className="text-lg leading-none mt-0.5">{alert.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${cfg.badge}`}
            >
              {cfg.label}
            </span>
            <span className="text-[10px] text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded">
              {TYPE_LABELS[alert.type] || "Alert"}
            </span>
          </div>
          <p className="text-xs font-semibold text-card-foreground leading-snug">
            {alert.title}
          </p>

          {expanded && (
            <div className="mt-2 space-y-1.5">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {alert.description}
              </p>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Newspaper className="w-3 h-3" />
                {alert.source}
              </div>
                <a
                href={alert.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
              >
                Check linked guidance <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-muted-foreground">
              {alert.source}
            </span>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-[10px] text-primary flex items-center gap-0.5 hover:underline"
            >
              {expanded ? (
                <>
                  Less <ChevronUp className="w-3 h-3" />
                </>
              ) : (
                <>
                  More <ChevronDown className="w-3 h-3" />
                </>
              )}
            </button>
          </div>
        </div>
        <SeverityIcon severity={alert.severity} />
      </div>
    </div>
  );
}

export default function SafetyWarnings({
  destination,
  autoFetch = true,
}: SafetyWarningsProps) {
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [fetched, setFetched] = useState(false);

  const load = useCallback(async () => {
    if (!destination) return;
    setLoading(true);
    try {
      const alertsData = await fetchSafetyAlerts(destination, 2);
      setAlerts(alertsData);
      setLastFetched(new Date());
      setFetched(true);
    } catch (err) {
      console.error("Safety fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [destination]);

  useEffect(() => {
    if (autoFetch && destination && !fetched) {
      load();
    }
  }, [autoFetch, destination, fetched, load]);

  const filteredAlerts =
    activeFilter === "all"
      ? alerts
      : activeFilter === "critical"
        ? alerts.filter(
            (a) => a.severity === "critical" || a.severity === "high",
          )
        : alerts.filter((a) => a.type === activeFilter);

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const highCount = alerts.filter((a) => a.severity === "high").length;
  const totalWarnings = alerts.length;

  const uniqueTypes = Array.from(new Set(alerts.map((a) => a.type)));

  return (
    <div className="bg-card rounded-2xl shadow-card overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b border-border cursor-pointer"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-xl ${
              criticalCount > 0
                ? "bg-red-500/10"
                : highCount > 0
                  ? "bg-orange-500/10"
                  : "bg-green-500/10"
            }`}
          >
            {criticalCount > 0 ? (
              <ShieldAlert className="w-5 h-5 text-red-600" />
            ) : highCount > 0 ? (
              <AlertTriangle className="w-5 h-5 text-orange-500" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-green-500" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-card-foreground text-sm flex items-center gap-2">
              Travel Safety Guidance
              {totalWarnings > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    criticalCount > 0
                      ? "bg-red-500 text-white"
                      : "bg-orange-500 text-white"
                  }`}
                >
                  {totalWarnings}
                </span>
              )}
            </h3>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {destination} · Curated travel guidance
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastFetched && (
            <span className="text-[10px] text-muted-foreground hidden sm:block">
              Loaded {formatRelativeTime(lastFetched.toISOString())}
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              load();
            }}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
            title="Refresh safety data"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-muted-foreground ${loading ? "animate-spin" : ""}`}
            />
          </button>
          {collapsed ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="p-4 space-y-4">
          {/* Loading state */}
          {loading && !fetched && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="relative">
                <Shield className="w-10 h-10 text-muted-foreground/30" />
                <Loader2 className="w-5 h-5 text-primary animate-spin absolute -bottom-1 -right-1" />
              </div>
              <p className="text-sm text-muted-foreground">
                Loading curated safety guidance for{" "}
                <span className="font-semibold text-card-foreground">
                  {destination}
                </span>
                ...
              </p>
            </div>
          )}

          {/* Not yet fetched */}
          {!loading && !fetched && (
            <div className="flex flex-col items-center py-6 gap-3">
              <Shield className="w-10 h-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground text-center">
                Review general safety guidance before you travel
              </p>
              <button
                onClick={load}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 flex items-center gap-2"
              >
                <Shield className="w-3.5 h-3.5" />
                Load Safety Guidance
              </button>
            </div>
          )}

          {/* Fetched results */}
          {fetched && (
            <>
              <p className="text-xs text-muted-foreground rounded-lg bg-secondary/40 p-3">
                These are static curated tips matched to the destination, not live incident reports or a comprehensive safety rating. Check current local and government advisories before travel.
              </p>

              {/* Stats row */}
              {totalWarnings > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center p-2 rounded-xl bg-red-500/10 border border-red-500/20">
                    <p className="text-lg font-bold text-red-600">
                      {criticalCount}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Critical Severity
                    </p>
                  </div>
                  <div className="text-center p-2 rounded-xl bg-orange-500/10 border border-orange-500/20">
                    <p className="text-lg font-bold text-orange-500">
                      {highCount}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      High Severity
                    </p>
                  </div>
                  <div className="text-center p-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                    <p className="text-lg font-bold text-yellow-600">
                      {totalWarnings - criticalCount - highCount}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Other Severity
                    </p>
                  </div>
                </div>
              )}

              {/* Filter chips */}
              {uniqueTypes.length > 1 && (
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    onClick={() => setActiveFilter("all")}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                      activeFilter === "all"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                    }`}
                  >
                    All ({totalWarnings})
                  </button>
                  <button
                    onClick={() => setActiveFilter("critical")}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                      activeFilter === "critical"
                        ? "bg-red-500 text-white"
                        : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                    }`}
                  >
                    🚨 High / Critical ({criticalCount + highCount})
                  </button>
                  {uniqueTypes.slice(0, 3).map((type) => (
                    <button
                      key={type}
                      onClick={() => setActiveFilter(type)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                        activeFilter === type
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                      }`}
                    >
                      {TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
              )}

              {/* Alerts list */}
              {filteredAlerts.length > 0 ? (
                <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                  {filteredAlerts.map((alert) => (
                    <AlertCard key={alert.id} alert={alert} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center py-8 gap-2">
                  <ShieldCheck className="w-10 h-10 text-green-500/60" />
                  <p className="text-sm font-semibold text-card-foreground">
                    No additional guidance found
                  </p>
                  <p className="text-xs text-muted-foreground text-center">
                    No additional curated guidance matched for{" "}
                    <span className="font-medium">{destination}</span>.
                    <br />
                    Always exercise standard travel precautions.
                  </p>
                </div>
              )}

              {/* Safety tips */}
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
                <p className="text-xs font-semibold text-primary mb-2 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" /> General Safety Tips
                </p>
                <ul className="space-y-1">
                  {[
                    "Share your live location with trusted contacts",
                    "Keep emergency numbers saved (Police: 100, Ambulance: 108)",
                    "Avoid isolated areas especially after dark",
                    "Keep copies of important documents",
                    "Use the SOS button in emergencies",
                  ].map((tip, i) => (
                    <li
                      key={i}
                      className="text-[11px] text-muted-foreground flex items-start gap-1.5"
                    >
                      <span className="text-primary mt-0.5">•</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>

              {loading && (
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Refreshing alerts...
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
