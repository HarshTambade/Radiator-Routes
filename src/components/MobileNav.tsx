import { useLocation, Link } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  Compass,
  Users,
  UserCircle,
} from "lucide-react";

const mobileNavItems = [
  { title: "Home", url: "/dashboard", icon: LayoutDashboard },
  { title: "Trips", url: "/itinerary", icon: CalendarDays },
  { title: "Explore", url: "/explore", icon: Compass },
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

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {/* Frosted glass bar */}
      <div className="bg-card/95 backdrop-blur-xl border-t border-border shadow-2xl">
        <div className="flex items-stretch">
          {mobileNavItems.map((item) => {
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
                {/* Active indicator pill */}
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />
                )}

                {/* Icon with background for active */}
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
          })}
        </div>
      </div>
    </nav>
  );
}
