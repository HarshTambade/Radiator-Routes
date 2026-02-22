import { useState } from "react";
import { Menu, AlertTriangle, Bell, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import LanguageSwitcher from "./LanguageSwitcher";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/itinerary": "My Itinerary",
  "/explore": "Explore",
  "/guide": "Guide",
  "/friends": "Friends",
  "/community": "Community",
  "/profile": "Profile",
};

interface MobileHeaderProps {
  onMenuOpen: () => void;
  onSOSOpen: () => void;
}

export default function MobileHeader({
  onMenuOpen,
  onSOSOpen,
}: MobileHeaderProps) {
  const location = useLocation();
  const [notifOpen, setNotifOpen] = useState(false);

  const getTitle = () => {
    // Match /itinerary/:id
    if (location.pathname.startsWith("/itinerary/")) return "Itinerary";
    return PAGE_TITLES[location.pathname] ?? "Radiator Routes";
  };

  return (
    <>
      <header
        className="md:hidden fixed top-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-xl border-b border-border"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex items-center justify-between px-4 h-14">
          {/* Left: hamburger */}
          <button
            onClick={onMenuOpen}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5 text-card-foreground" />
          </button>

          {/* Center: logo + title */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-white font-black text-[10px]">RR</span>
            </div>
            <span className="font-bold text-card-foreground text-sm">
              {getTitle()}
            </span>
          </div>

          {/* Right: Language + notif + SOS */}
          <div className="flex items-center gap-1.5">
            <LanguageSwitcher compact />
            <button
              onClick={() => setNotifOpen((v) => !v)}
              className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors relative"
              aria-label="Notifications"
            >
              <Bell className="w-4.5 h-4.5 text-card-foreground" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
            </button>
            <button
              onClick={onSOSOpen}
              className="h-9 px-3 rounded-xl bg-red-600 text-white text-[11px] font-black tracking-widest flex items-center gap-1 hover:bg-red-700 active:scale-95 transition-all"
              aria-label="SOS Emergency"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              SOS
            </button>
          </div>
        </div>
      </header>

      {/* Notification dropdown */}
      {notifOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          onClick={() => setNotifOpen(false)}
        >
          <div
            className="absolute top-14 right-4 w-72 bg-card rounded-2xl shadow-2xl border border-border overflow-hidden animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold text-card-foreground">
                Notifications
              </span>
              <button
                onClick={() => setNotifOpen(false)}
                className="p-1 rounded-lg hover:bg-secondary transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="divide-y divide-border">
              {[
                {
                  emoji: "🛡️",
                  title: "Safety Alert",
                  body: "Check safety warnings before your next trip.",
                  time: "2m ago",
                  color: "bg-red-500/10",
                },
                {
                  emoji: "✨",
                  title: "AI Plan Ready",
                  body: "Your itinerary for Goa has been generated.",
                  time: "1h ago",
                  color: "bg-primary/5",
                },
                {
                  emoji: "💰",
                  title: "Budget Tip",
                  body: "Book Goa hotels 2 weeks ahead to save 30%.",
                  time: "3h ago",
                  color: "bg-green-500/5",
                },
              ].map((n, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors cursor-pointer ${n.color}`}
                >
                  <span className="text-xl leading-none mt-0.5 shrink-0">
                    {n.emoji}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-card-foreground">
                      {n.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                      {n.body}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">
                    {n.time}
                  </span>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-border">
              <button
                onClick={() => setNotifOpen(false)}
                className="w-full text-xs text-primary font-semibold text-center hover:underline"
              >
                Mark all as read
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
