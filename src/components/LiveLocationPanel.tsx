import { useState, useEffect, useRef, useCallback } from "react";
import {
  MapPin,
  Navigation,
  Users,
  Locate,
  LocateOff,
  X,
  ExternalLink,
  Clock,
  Wifi,
  WifiOff,
  Radio,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface MemberLocation {
  userId: string;
  userName: string;
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp: number;
  initials: string;
  color: string;
}

interface Props {
  tripId: string;
  tripName: string;
}

const MEMBER_COLORS = [
  "#f97316", // orange
  "#3b82f6", // blue
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f59e0b", // amber
  "#06b6d4", // cyan
  "#ef4444", // red
];

function getColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0;
  }
  return MEMBER_COLORS[Math.abs(hash) % MEMBER_COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function formatAgo(timestamp: number): string {
  const secs = Math.floor((Date.now() - timestamp) / 1000);
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

export default function LiveLocationPanel({ tripId, tripName }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [members, setMembers] = useState<MemberLocation[]>([]);
  const [myLocation, setMyLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [tick, setTick] = useState(0);
  const [channelStatus, setChannelStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("disconnected");

  const watchIdRef = useRef<number | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const sharingRef = useRef(false);

  const userName =
    user?.user_metadata?.name || user?.email?.split("@")[0] || "Traveler";

  // Tick every 10 seconds to refresh "X ago" labels
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  // ── Subscribe to presence channel ───────────────────────────────────────
  useEffect(() => {
    if (!user || !tripId) return;

    const channel = supabase.channel(`live-location-${tripId}`, {
      config: { presence: { key: user.id } },
    });

    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{
          userId: string;
          userName: string;
          lat: number;
          lng: number;
          accuracy?: number;
          timestamp: number;
        }>();

        const locs: MemberLocation[] = [];
        for (const [uid, presences] of Object.entries(state)) {
          if (uid === user.id) continue; // exclude self from members list
          const latest = (presences as any[]).sort(
            (a, b) => b.timestamp - a.timestamp,
          )[0];
          if (!latest?.lat) continue;
          locs.push({
            userId: uid,
            userName: latest.userName ?? "Traveler",
            lat: latest.lat,
            lng: latest.lng,
            accuracy: latest.accuracy,
            timestamp: latest.timestamp,
            initials: getInitials(latest.userName ?? "T"),
            color: getColor(uid),
          });
        }
        setMembers(locs);
        setChannelStatus("connected");
      })
      .on("presence", { event: "join" }, ({ newPresences }) => {
        if (!newPresences?.length) return;
        const p = newPresences[0] as any;
        if (p.userId === user.id) return;
        toast({
          title: `📍 ${p.userName ?? "Someone"} started sharing location`,
          description: tripName,
        });
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        if (!leftPresences?.length) return;
        const p = leftPresences[0] as any;
        if (p.userId === user.id) return;
        toast({
          title: `${p.userName ?? "Someone"} stopped sharing location`,
          description: tripName,
        });
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setChannelStatus("connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          setChannelStatus("disconnected");
        else setChannelStatus("connecting");
      });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setChannelStatus("disconnected");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, user?.id]);

  // ── Track my location ────────────────────────────────────────────────────
  const startSharing = useCallback(() => {
    if (!navigator.geolocation) {
      toast({
        title: "Geolocation not supported",
        description: "Your browser doesn't support location sharing.",
        variant: "destructive",
      });
      return;
    }

    sharingRef.current = true;
    setSharing(true);

    const publish = (lat: number, lng: number, accuracy?: number) => {
      setMyLocation({ lat, lng });
      channelRef.current
        ?.track({
          userId: user!.id,
          userName,
          lat,
          lng,
          accuracy,
          timestamp: Date.now(),
        })
        .catch(() => {});
    };

    // Get an immediate position first
    navigator.geolocation.getCurrentPosition(
      (pos) => publish(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
      () => {},
      { enableHighAccuracy: true, timeout: 5000 },
    );

    // Then watch for updates
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (!sharingRef.current) return;
        publish(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy,
        );
      },
      (err) => {
        sharingRef.current = false;
        setSharing(false);
        watchIdRef.current = null;
        if (err.code === 1) {
          toast({
            title: "Location access denied",
            description:
              "Please allow location access in your browser settings.",
            variant: "destructive",
          });
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );
  }, [user, userName, toast]);

  const stopSharing = useCallback(async () => {
    sharingRef.current = false;
    setSharing(false);
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    await channelRef.current?.untrack().catch(() => {});
    setMyLocation(null);
    toast({ title: "📍 Location sharing stopped" });
  }, [toast]);

  // Stop watching on unmount
  useEffect(() => {
    return () => {
      sharingRef.current = false;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const openInMaps = (member: MemberLocation) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${member.lat},${member.lng}&travelmode=walking`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const activeMembersCount = members.filter(
    (m) => Date.now() - m.timestamp < 5 * 60_000,
  ).length;

  return (
    <div className="relative">
      {/* ── Trigger button ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
          sharing
            ? "border-success bg-success/10 text-success"
            : activeMembersCount > 0
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-card-foreground hover:bg-secondary"
        }`}
        title="Live Location Sharing"
      >
        <Radio
          className={`w-4 h-4 ${sharing ? "animate-pulse" : ""}`}
        />
        <span className="hidden sm:inline">Live</span>
        {activeMembersCount > 0 && (
          <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
            {activeMembersCount}
          </span>
        )}
      </button>

      {/* ── Panel ── */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[320px] sm:w-[360px] bg-card border border-border rounded-2xl shadow-elevated z-[100] animate-fade-in overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              <p className="text-sm font-bold text-card-foreground">
                Live Locations
              </p>
              <span
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  channelStatus === "connected"
                    ? "bg-success/10 text-success"
                    : channelStatus === "connecting"
                      ? "bg-warning/10 text-warning"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {channelStatus === "connected" ? (
                  <Wifi className="w-2.5 h-2.5" />
                ) : (
                  <WifiOff className="w-2.5 h-2.5" />
                )}
                {channelStatus}
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg hover:bg-secondary text-muted-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* My sharing toggle */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center justify-between mb-1">
              <div>
                <p className="text-xs font-semibold text-card-foreground">
                  Share My Location
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {sharing
                    ? myLocation
                      ? `Sharing · ${myLocation.lat.toFixed(5)}, ${myLocation.lng.toFixed(5)}`
                      : "Getting your location…"
                    : "Only visible to trip members"}
                </p>
              </div>
              <button
                onClick={sharing ? stopSharing : startSharing}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  sharing
                    ? "bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                }`}
              >
                {sharing ? (
                  <>
                    <LocateOff className="w-3.5 h-3.5" />
                    Stop
                  </>
                ) : (
                  <>
                    <Locate className="w-3.5 h-3.5" />
                    Start
                  </>
                )}
              </button>
            </div>
            {sharing && (
              <div className="flex items-center gap-1.5 mt-2">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span className="text-[10px] text-success font-semibold">
                  Broadcasting live · updates every 5 sec
                </span>
              </div>
            )}
          </div>

          {/* Members list */}
          <div className="max-h-64 overflow-y-auto">
            {members.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs font-semibold text-card-foreground">
                  No one else is sharing yet
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Ask your trip members to enable Live Location
                </p>
              </div>
            ) : (
              members.map((m) => {
                const isStale = Date.now() - m.timestamp > 5 * 60_000;
                const distFromMe =
                  myLocation && !isStale
                    ? distanceKm(
                        myLocation.lat,
                        myLocation.lng,
                        m.lat,
                        m.lng,
                      )
                    : null;

                return (
                  <div
                    key={m.userId}
                    className={`px-4 py-3 flex items-center gap-3 border-b border-border/50 last:border-0 ${
                      isStale ? "opacity-50" : ""
                    }`}
                  >
                    {/* Avatar */}
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: m.color }}
                    >
                      {m.initials}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-card-foreground truncate">
                          {m.userName}
                        </p>
                        {!isStale && (
                          <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="w-2.5 h-2.5" />
                          {formatAgo(m.timestamp)}
                        </span>
                        {distFromMe !== null && (
                          <span className="flex items-center gap-1 text-[10px] text-primary font-semibold">
                            <MapPin className="w-2.5 h-2.5" />
                            {formatDistance(distFromMe)} away
                          </span>
                        )}
                        {m.accuracy && (
                          <span className="text-[10px] text-muted-foreground">
                            ±{Math.round(m.accuracy)}m
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Navigate button */}
                    <button
                      onClick={() => openInMaps(m)}
                      title={`Navigate to ${m.userName}`}
                      className="shrink-0 p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Map link */}
          {members.length > 0 && myLocation && (
            <div className="px-4 py-3 border-t border-border bg-secondary/20">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${members
                  .map((m) => `${m.lat},${m.lng}`)
                  .join("|")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-xs font-semibold text-primary hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View all members on Google Maps
              </a>
            </div>
          )}

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-border bg-secondary/10">
            <p className="text-[10px] text-muted-foreground text-center">
              🔒 Location visible only to {tripName} members · Clears when you leave
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
