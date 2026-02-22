import { useState } from "react";
import { useLocation, Link } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  Compass,
  BookOpen,
  Users,
  LogOut,
  Plus,
  MapPin,
  Globe,
  UserCircle,
  AlertTriangle,
  Accessibility,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTrips } from "@/hooks/useTrips";
import { useLanguage } from "@/hooks/useLanguage";

const NAV_ITEMS = [
  { key: "dashboard" as const, url: "/dashboard", icon: LayoutDashboard },
  { key: "myTrips" as const, url: "/itinerary", icon: CalendarDays },
];

const DISCOVER_ITEMS = [
  { key: "explore" as const, url: "/explore", icon: Compass },
  { key: "guide" as const, url: "/guide", icon: BookOpen },
  { key: "friends" as const, url: "/friends", icon: Users },
  { key: "community" as const, url: "/community", icon: Globe },
  { key: "profile" as const, url: "/profile", icon: UserCircle },
];

interface AppSidebarProps {
  onSOSOpen?: () => void;
  onA11yOpen?: () => void;
  /** When rendered inside mobile drawer, skip the fixed height + collapse toggle */
  mobileDrawer?: boolean;
}

export function AppSidebar({
  onSOSOpen,
  onA11yOpen,
  mobileDrawer = false,
}: AppSidebarProps) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { user, signOut } = useAuth();
  const { data: trips = [] } = useTrips();
  const { t } = useLanguage();

  const isActive = (url: string) => {
    if (url === "/itinerary") return location.pathname.startsWith("/itinerary");
    return location.pathname === url;
  };

  const userName =
    user?.user_metadata?.name || user?.email?.split("@")[0] || "Traveler";

  const effectiveCollapsed = mobileDrawer ? false : collapsed;

  return (
    <aside
      className={`
        flex flex-col bg-card border-r border-border
        transition-all duration-300 overflow-hidden
        ${
          mobileDrawer
            ? "w-full min-h-full"
            : effectiveCollapsed
              ? "w-[68px] h-screen"
              : "w-[240px] h-screen"
        }
      `}
    >
      {/* ── Brand ── */}
      {!mobileDrawer && (
        <div className="shrink-0 flex items-center justify-between px-4 py-3.5 border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4 text-primary-foreground" />
            </div>
            {!effectiveCollapsed && (
              <div className="min-w-0">
                <p className="text-sm font-bold text-card-foreground truncate leading-tight">
                  Radiator Routes
                </p>
                <p className="text-[10px] text-muted-foreground truncate leading-tight">
                  {userName}
                </p>
              </div>
            )}
          </div>
          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="shrink-0 w-6 h-6 rounded-lg hover:bg-secondary transition-colors flex items-center justify-center"
            aria-label={
              effectiveCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
          >
            {effectiveCollapsed ? (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </button>
        </div>
      )}

      {/* ── New Trip Button ── */}
      <div className={`shrink-0 px-3 pt-3 ${mobileDrawer ? "pb-1" : ""}`}>
        <Link
          to="/dashboard"
          className={`flex items-center justify-center gap-2 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity ${
            effectiveCollapsed ? "px-0" : "px-3"
          }`}
        >
          <Plus className="w-4 h-4 shrink-0" />
          {!effectiveCollapsed && <span>New Trip</span>}
        </Link>
      </div>

      {/* ── Scrollable Middle Section ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 space-y-1 min-h-0">
        {/* My Trips */}
        {!effectiveCollapsed && trips.length > 0 && (
          <div className="px-3 pt-2 pb-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1.5">
              My Trips
            </p>
            <div className="space-y-0.5">
              {trips.slice(0, 5).map((trip) => (
                <Link
                  key={trip.id}
                  to={`/itinerary/${trip.id}`}
                  className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-secondary/60 transition-colors group ${
                    location.pathname === `/itinerary/${trip.id}`
                      ? "bg-secondary"
                      : ""
                  }`}
                >
                  <span className="text-base leading-none shrink-0">🗺️</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-card-foreground truncate leading-tight">
                      {trip.destination}
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      ₹{Number(trip.budget_total).toLocaleString("en-IN")}
                    </p>
                  </div>
                </Link>
              ))}
              {trips.length > 5 && (
                <p className="text-[10px] text-muted-foreground px-2 py-1">
                  +{trips.length - 5} more trips
                </p>
              )}
            </div>
          </div>
        )}

        {/* General Nav */}
        <div className="px-3 pt-1">
          {!effectiveCollapsed && (
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1.5">
              General
            </p>
          )}
          <div className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const label = t(item.key);
              return (
                <Link
                  key={item.key}
                  to={item.url}
                  className={`flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                    isActive(item.url)
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-card-foreground"
                  } ${effectiveCollapsed ? "justify-center px-0" : ""}`}
                  title={effectiveCollapsed ? label : undefined}
                >
                  <item.icon className="w-[18px] h-[18px] shrink-0" />
                  {!effectiveCollapsed && (
                    <span className="flex-1 truncate">{label}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Discover Nav */}
        <div className="px-3 pt-2">
          {!effectiveCollapsed && (
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1.5">
              {t("discover")}
            </p>
          )}
          <div className="space-y-0.5">
            {DISCOVER_ITEMS.map((item) => {
              const label = t(item.key);
              return (
                <Link
                  key={item.key}
                  to={item.url}
                  className={`flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                    isActive(item.url)
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-card-foreground"
                  } ${effectiveCollapsed ? "justify-center px-0" : ""}`}
                  title={effectiveCollapsed ? label : undefined}
                >
                  <item.icon className="w-[18px] h-[18px] shrink-0" />
                  {!effectiveCollapsed && (
                    <span className="flex-1 truncate">{label}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Bottom Actions (fixed, never overflows) ── */}
      <div className="shrink-0 px-3 pb-4 pt-2 border-t border-border space-y-0.5">
        {/* SOS */}
        <button
          onClick={onSOSOpen}
          className={`flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm font-medium text-red-600 hover:bg-red-500/10 transition-colors w-full ${
            effectiveCollapsed ? "justify-center px-0" : ""
          }`}
          title={t("emergency")}
          aria-label="SOS Emergency"
        >
          <AlertTriangle className="w-[18px] h-[18px] shrink-0" />
          {!effectiveCollapsed && (
            <span className="flex-1 text-left">SOS &amp; {t("emergency")}</span>
          )}
        </button>

        {/* Accessibility */}
        <button
          onClick={onA11yOpen}
          className={`flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm font-medium text-purple-600 hover:bg-purple-500/10 transition-colors w-full ${
            effectiveCollapsed ? "justify-center px-0" : ""
          }`}
          title="Accessibility"
          aria-label="Accessibility Options"
        >
          <Accessibility className="w-[18px] h-[18px] shrink-0" />
          {!effectiveCollapsed && (
            <span className="flex-1 text-left">Accessibility</span>
          )}
        </button>

        {/* Logout */}
        <button
          onClick={signOut}
          className={`flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors w-full ${
            effectiveCollapsed ? "justify-center px-0" : ""
          }`}
          title="Logout"
          aria-label="Logout"
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          {!effectiveCollapsed && (
            <span className="flex-1 text-left">Logout</span>
          )}
        </button>
      </div>
    </aside>
  );
}
