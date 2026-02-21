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
  Clock,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Newspaper,
} from "lucide-react";
import {
  fetchSafetyAlerts,
  fetchSafetyScore,
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

function SafetyScoreRing({ score }: { score: number }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const progress = ((100 - score) / 100) * circumference;
  const color =
    score >= 70
      ? "#ef4444"
      : score >= 40
        ? "#f97316"
        : score >= 20
          ? "#eab308"
          : "#22c55e";

  return (
    <div className="relative w-20 h-20 flex items-center justify-center">
      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 72 72">
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-border"
        />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div className="text-center">
        <p className="text-xs font-bold" style={{ color }}>
          {score}
        </p>
        <p className="text-[9px] text-muted-foreground leading-none">
          risk
        </p>
      </div>
    </div>
  );
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
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Newspaper className="w-3 h-3" />
                  {alert.source}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatRelativeTime(alert.publishedAt)}
                </span>
              </div>
              <a
                href={alert.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
              >
                Read full article <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-muted-foreground">
              {formatRelativeTime(alert.publishedAt)} · {alert.source}
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
  const [safetyScore, setSafetyScore] = useState<{
    score: number;
    label: string;
    color: string;
    summary: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [fetched, setFetched] = useState(false);

  const load = useCallback(async () => {
    if (!destination) return;
    setLoading(true);
    try {
      const [alertsData, scoreData] = await Promise.all([
        fetchSafetyAlerts(destination, 2),
        fetchSafetyScore(destination),
      ]);
      setAlerts(alertsData);
      setSafetyScore(scoreData);
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
              Safety Warnings
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
              {destination} · Real-time news alerts
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastFetched && (
            <span className="text-[10px] text-muted-foreground hidden sm:block">
              Updated {formatRelativeTime(lastFetched.toISOString())}
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
                Scanning real-time safety news for{" "}
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
                Check real-time safety alerts before you travel
              </p>
              <button
                onClick={load}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 flex items-center gap-2"
              >
                <Shield className="w-3.5 h-3.5" />
                Check Safety Now
              </button>
            </div>
          )}

          {/* Fetched results */}
          {fetched && (
            <>
              {/* Safety Score + Summary */}
              {safetyScore && (
                <div className="flex items-center gap-4 p-3 rounded-xl bg-secondary/40 border border-border">
                  <SafetyScoreRing score={safetyScore.score} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-sm font-bold ${safetyScore.color}`}
                      >
                        {safetyScore.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · Risk Index: {safetyScore.score}/100
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {safetyScore.summary}
                    </p>
                  </div>
                </div>
              )}

              {/* Stats row */}
              {totalWarnings > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center p-2 rounded-xl bg-red-500/10 border border-red-500/20">
                    <p className="text-lg font-bold text-red-600">
                      {criticalCount}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Critical
                    </p>
                  </div>
                  <div className="text-center p-2 rounded-xl bg-orange-500/10 border border-orange-500/20">
                    <p className="text-lg font-bold text-orange-500">
                      {highCount}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      High Risk
                    </p>
                  </div>
                  <div className="text-center p-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                    <p className="text-lg font-bold text-yellow-600">
                      {totalWarnings - criticalCount - highCount}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Moderate
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
                    🚨 Urgent ({criticalCount + highCount})
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
                    No alerts found
                  </p>
                  <p className="text-xs text-muted-foreground text-center">
                    No recent safety incidents reported for{" "}
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
