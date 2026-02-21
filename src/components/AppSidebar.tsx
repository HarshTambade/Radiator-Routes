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
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTrips } from "@/hooks/useTrips";
import SOSPanel from "@/components/SOSPanel";
import AccessibilityPanel from "@/components/AccessibilityPanel";

const navItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Itinerary", url: "/itinerary", icon: CalendarDays },
];

const discoverItems = [
  { title: "Explore", url: "/explore", icon: Compass },
  { title: "Guide", url: "/guide", icon: BookOpen },
  { title: "Friends", url: "/friends", icon: Users },
  { title: "Community", url: "/community", icon: Globe },
  { title: "Profile", url: "/profile", icon: UserCircle },
];

export function AppSidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [showSOS, setShowSOS] = useState(false);
  const [showA11y, setShowA11y] = useState(false);
  const { user, signOut } = useAuth();
  const { data: trips = [] } = useTrips();

  const isActive = (url: string) => location.pathname === url;
  const userName =
    user?.user_metadata?.name || user?.email?.split("@")[0] || "Traveler";

  return (
    <aside
      className={`flex flex-col h-screen bg-card border-r border-border transition-all duration-300 ${
        collapsed ? "w-[68px]" : "w-[260px]"
      } shrink-0`}
    >
      {/* Brand */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-card-foreground truncate">
                Radiator Routes
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {userName}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* New Trip Button */}
      <div className="px-3 pt-4">
        <Link
          to="/dashboard"
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          {!collapsed && <span>New Trip</span>}
        </Link>
      </div>

      {/* Trips from DB */}
      {!collapsed && trips.length > 0 && (
        <div className="px-3 pt-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
            My Trips
          </p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {trips.map((trip) => (
              <Link
                key={trip.id}
                to={`/itinerary/${trip.id}`}
                className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-secondary/60 transition-colors group"
              >
                <span className="text-lg">🇮🇳</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-card-foreground truncate">
                    {trip.destination}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ₹{Number(trip.budget_total).toLocaleString("en-IN")}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* General Nav */}
      <div className="px-3 pt-5">
        {!collapsed && (
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
            General
          </p>
        )}
        <div className="space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.title}
              to={item.url}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.url)
                  ? "bg-secondary text-card-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-card-foreground"
              }`}
            >
              <item.icon className="w-[18px] h-[18px] shrink-0" />
              {!collapsed && <span className="flex-1">{item.title}</span>}
            </Link>
          ))}
        </div>
      </div>

      {/* Discover Nav */}
      <div className="px-3 pt-5">
        {!collapsed && (
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
            Discover
          </p>
        )}
        <div className="space-y-1">
          {discoverItems.map((item) => (
            <Link
              key={item.title}
              to={item.url}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.url)
                  ? "bg-secondary text-card-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-card-foreground"
              }`}
            >
              <item.icon className="w-[18px] h-[18px] shrink-0" />
              {!collapsed && <span>{item.title}</span>}
            </Link>
          ))}
        </div>
      </div>

      {/* Spacer + Utility Buttons + Logout */}
      <div className="mt-auto px-3 pb-4 space-y-1">
        {/* SOS Button */}
        <button
          onClick={() => {
            setShowSOS(true);
            setShowA11y(false);
          }}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-500/10 transition-colors w-full"
          title="SOS & Emergency"
        >
          <AlertTriangle className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && <span>SOS &amp; Emergency</span>}
        </button>

        {/* Accessibility Button */}
        <button
          onClick={() => {
            setShowA11y(true);
            setShowSOS(false);
          }}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-purple-600 hover:bg-purple-500/10 transition-colors w-full"
          title="Accessibility"
        >
          <Accessibility className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && <span>Accessibility</span>}
        </button>

        {/* Logout */}
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-primary hover:bg-primary/10 transition-colors w-full"
        >
          <LogOut className="w-[18px] h-[18px]" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>

      {/* SOS Overlay Panel */}
      {showSOS && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowSOS(false)}
        >
          <div
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between bg-card rounded-t-2xl px-4 py-3 border-b border-border">
              <span className="text-sm font-bold text-card-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" /> SOS &amp;
                Emergency
              </span>
              <button
                onClick={() => setShowSOS(false)}
                className="text-muted-foreground hover:text-foreground text-lg font-bold leading-none"
              >
                ×
              </button>
            </div>
            <SOSPanel />
          </div>
        </div>
      )}

      {/* Accessibility Overlay Panel */}
      {showA11y && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowA11y(false)}
        >
          <div
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between bg-card rounded-t-2xl px-4 py-3 border-b border-border">
              <span className="text-sm font-bold text-card-foreground flex items-center gap-2">
                <Accessibility className="w-4 h-4 text-purple-600" />{" "}
                Accessibility
              </span>
              <button
                onClick={() => setShowA11y(false)}
                className="text-muted-foreground hover:text-foreground text-lg font-bold leading-none"
              >
                ×
              </button>
            </div>
            <AccessibilityPanel />
          </div>
        </div>
      )}
    </aside>
  );
}
