import { useLocation, Link } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  Compass,
  Users,
  UserCircle,
} from "lucide-react";
import orangeBot from "@/assets/orange-bot.png";

const leftNavItems = [
  { title: "Home", url: "/dashboard", icon: LayoutDashboard },
  { title: "Trips", url: "/itinerary", icon: CalendarDays },
];

const rightNavItems = [
  { title: "Friends", url: "/friends", icon: Users },
  { title: "Profile", url: "/profile", icon: UserCircle },
];

export default function MobileNav() {
  const location = useLocation();

  const isActive = (url: string) => {
    if (url === "/itinerary") {
      return location.pathname.startsWith("/itinerary");
    }
    return location.pathname === url;
  };

  const openJinny = () => {
    window.dispatchEvent(new CustomEvent("jinny-open"));
  };

  const renderNavItem = (item: { title: string; url: string; icon: any }) => {
    const active = isActive(item.url);
    return (
      <Link
        key={item.title}
        to={item.url}
        className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 relative transition-all active:scale-95 ${
          active ? "text-primary" : "text-muted-foreground"
        }`}
        aria-label={item.title}
      >
        {active && (
          <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />
        )}
        <div
          className={`p-1.5 rounded-xl transition-all ${
            active ? "bg-primary/10" : ""
          }`}
        >
          <item.icon
            className={`w-[18px] h-[18px] transition-all ${
              active ? "stroke-[2.5px]" : "stroke-[1.8px]"
            }`}
          />
        </div>
        <span
          className={`text-[10px] font-medium leading-none transition-all ${
            active ? "font-semibold" : ""
          }`}
        >
          {item.title}
        </span>
      </Link>
    );
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="bg-card/95 backdrop-blur-xl border-t border-border shadow-2xl">
        <div className="flex items-stretch">
          {/* Left items */}
          {leftNavItems.map(renderNavItem)}

          {/* Center Jinny button */}
          <div className="flex-1 flex flex-col items-center justify-center py-1 relative">
            <button
              onClick={openJinny}
              aria-label="Open Jinny AI Assistant"
              className="flex flex-col items-center justify-center gap-0.5 active:scale-90 transition-transform"
            >
              {/* Glowing ring */}
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-orange-400/30 blur-md animate-pulse" />
                <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 shadow-lg flex items-center justify-center border-2 border-orange-300/50 -mt-5">
                  <img
                    src={orangeBot}
                    alt="Jinny"
                    className="w-9 h-9 object-contain drop-shadow-sm"
                    draggable={false}
                  />
                </div>
              </div>
              <span className="text-[10px] font-semibold text-orange-500 leading-none mt-1">
                Jinny
              </span>
            </button>
          </div>

          {/* Right items */}
          {rightNavItems.map(renderNavItem)}
        </div>
      </div>
    </nav>
  );
}
