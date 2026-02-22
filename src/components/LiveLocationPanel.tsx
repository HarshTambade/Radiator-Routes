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
  Map as MapIcon,
  RefreshCw,
} from "lucide-react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
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
  "#f97316",
  "#3b82f6",
  "#10b981",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#06b6d4",
  "#ef4444",
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

/* ── Auto-fit bounds ─────────────────────────────────────────────────────── */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 15, { animate: true });
      return;
    }
    const bounds: LatLngBoundsExpression = points as [number, number][];
    map.fitBounds(bounds, { padding: [28, 28], animate: true, maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, JSON.stringify(points)]);
  return null;
}

/* ── Mini live map ───────────────────────────────────────────────────────── */
function LiveMap({
  members,
  myLocation,
}: {
  members: MemberLocation[];
  myLocation: { lat: number; lng: number } | null;
}) {
  const active = members.filter((m) => Date.now() - m.timestamp < 5 * 60_000);
  const allPoints: [number, number][] = [];
  if (myLocation) allPoints.push([myLocation.lat, myLocation.lng]);
  active.forEach((m) => allPoints.push([m.lat, m.lng]));

  const center: [number, number] =
    allPoints.length > 0 ? allPoints[0] : [20.5937, 78.9629];

  return (
    <MapContainer
      center={center}
      zoom={13}
      className="w-full h-full"
      zoomControl={false}
      attributionControl={false}
      scrollWheelZoom={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      {/* Self — blue */}
      {myLocation && (
        <CircleMarker
          center={[myLocation.lat, myLocation.lng]}
          radius={9}
          pathOptions={{
            fillColor: "#3b82f6",
            fillOpacity: 0.95,
            color: "#fff",
            weight: 2.5,
          }}
        >
          <Popup>
            <span className="text-xs font-semibold">📍 You</span>
          </Popup>
        </CircleMarker>
      )}

      {/* Members */}
      {active.map((m) => (
        <CircleMarker
          key={m.userId}
          center={[m.lat, m.lng]}
          radius={8}
          pathOptions={{
            fillColor: m.color,
            fillOpacity: 0.92,
            color: "#fff",
            weight: 2,
          }}
        >
          <Popup>
            <div className="text-xs">
              <span className="font-bold">{m.userName}</span>
              <br />
              <span className="text-gray-500">{formatAgo(m.timestamp)}</span>
            </div>
          </Popup>
        </CircleMarker>
      ))}

      <FitBounds points={allPoints} />
    </MapContainer>
  );
}

/* ── Panel style (smart fixed positioning) ───────────────────────────────── */
interface PanelPos {
  top: number;
  left?: number;
  right?: number;
}

/* ── Main component ──────────────────────────────────────────────────────── */
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
  const [showMap, setShowMap] = useState(true);
  const [channelStatus, setChannelStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("disconnected");
  const [panelPos, setPanelPos] = useState<PanelPos>({ top: 0, left: 0 });

  const btnRef = useRef<HTMLButtonElement>(null);
  const watchIdRef = useRef<number | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const sharingRef = useRef(false);

  const userName =
    user?.user_metadata?.name || user?.email?.split("@")[0] || "Traveler";

  /* ── Tick for "X ago" refresh ──────────────────────────────────────────── */
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  /* ── Lock scroll when panel open on mobile ─────────────────────────────── */
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (open && isMobile) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  /* ── Smart panel position ───────────────────────────────────────────────── */
  const calcPanelPos = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const PANEL_W = 400;
    const top = rect.bottom + 8;

    // prefer right-aligned (right edge of panel = right edge of button)
    const rightVal = window.innerWidth - rect.right;
    const leftVal = rect.left;

    let pos: PanelPos;
    if (rightVal + rect.width >= PANEL_W) {
      // enough space to open leftward from button's right edge
      pos = { top, right: Math.max(8, rightVal) };
    } else if (leftVal + rect.width >= PANEL_W) {
      // open rightward from button's left edge
      pos = { top, left: Math.max(8, leftVal) };
    } else {
      // centre in viewport
      pos = { top, left: Math.max(8, (window.innerWidth - PANEL_W) / 2) };
    }
    setPanelPos(pos);
  }, []);

  const handleToggle = useCallback(() => {
    if (!open) calcPanelPos();
    setOpen((v) => !v);
  }, [open, calcPanelPos]);

  /* ── Supabase Presence channel ─────────────────────────────────────────── */
  useEffect(() => {
    if (!user || !tripId) return;

    setChannelStatus("connecting");

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
          if (uid === user.id) continue;
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
      })
      .on("presence", { event: "join" }, ({ newPresences }) => {
        if (!newPresences?.length) return;
        const p = newPresences[0] as any;
        if (p.userId === user.id) return;
        toast({
          title: `📍 ${p.userName ?? "Someone"} started sharing`,
          description: tripName,
        });
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        if (!leftPresences?.length) return;
        const p = leftPresences[0] as any;
        if (p.userId === user.id) return;
        toast({
          title: `${p.userName ?? "Someone"} stopped sharing`,
          description: tripName,
        });
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setChannelStatus("connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setChannelStatus("disconnected");
          toast({
            title: "Live location disconnected",
            description: "Check your connection and try again.",
            variant: "destructive",
          });
        } else {
          setChannelStatus("connecting");
        }
      });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setChannelStatus("disconnected");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, user?.id]);

  /* ── Reconnect helper ───────────────────────────────────────────────────── */
  const reconnect = useCallback(() => {
    if (!user || !tripId) return;
    // Cleanup old channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setChannelStatus("connecting");

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
          if (uid === user.id) continue;
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
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setChannelStatus("connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          setChannelStatus("disconnected");
        else setChannelStatus("connecting");
      });
  }, [user, tripId]);

  /* ── Start sharing ──────────────────────────────────────────────────────── */
  const startSharing = useCallback(() => {
    if (!navigator.geolocation) {
      toast({
        title: "Geolocation not supported",
        description: "Your browser doesn't support location sharing.",
        variant: "destructive",
      });
      return;
    }

    if (channelStatus !== "connected") {
      toast({
        title: "Not connected to live channel",
        description: "Reconnecting… please try again in a moment.",
        variant: "destructive",
      });
      reconnect();
      return;
    }

    sharingRef.current = true;
    setSharing(true);

    const publish = (lat: number, lng: number, accuracy?: number) => {
      setMyLocation({ lat, lng });
      if (!channelRef.current) return;
      channelRef.current
        .track({
          userId: user!.id,
          userName,
          lat,
          lng,
          accuracy,
          timestamp: Date.now(),
        })
        .then((resp) => {
          // "ok" means success; anything else is a soft error
          if (resp !== "ok") {
            console.warn("Presence track returned:", resp);
          }
        })
        .catch((err) => {
          console.error("Presence track error:", err);
          sharingRef.current = false;
          setSharing(false);
          toast({
            title: "Failed to share location",
            description:
              "Could not broadcast your position. Check your connection.",
            variant: "destructive",
          });
        });
    };

    // Immediate position
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        publish(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
      (err) => {
        sharingRef.current = false;
        setSharing(false);
        toast({
          title: "Location error",
          description:
            err.code === 1
              ? "Location access denied — allow it in browser settings."
              : "Could not get your position.",
          variant: "destructive",
        });
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );

    // Continuous watch
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (!sharingRef.current) return;
        publish(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
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
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 12_000 },
    );
  }, [user, userName, toast, channelStatus, reconnect]);

  /* ── Stop sharing ───────────────────────────────────────────────────────── */
  const stopSharing = useCallback(async () => {
    sharingRef.current = false;
    setSharing(false);
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    try {
      await channelRef.current?.untrack();
    } catch (_) {
      /* ignore */
    }
    setMyLocation(null);
    toast({ title: "📍 Location sharing stopped" });
  }, [toast]);

  /* ── Cleanup on unmount ─────────────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      sharingRef.current = false;
      if (watchIdRef.current !== null)
        navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  const openInMaps = (member: MemberLocation) => {
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${member.lat},${member.lng}&travelmode=walking`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const activeMembersCount = members.filter(
    (m) => Date.now() - m.timestamp < 5 * 60_000,
  ).length;
  const hasMapData = !!(myLocation || activeMembersCount > 0);

  /* ── Panel content (shared desktop + mobile) ────────────────────────────── */
  const panelContent = (
    <div
      className="flex flex-col overflow-hidden"
      style={{ maxHeight: "inherit" }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="w-4 h-4 text-primary shrink-0" />
          <p className="text-sm font-bold text-card-foreground truncate">
            Live Locations
          </p>
          {/* Status badge */}
          <span
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
              channelStatus === "connected"
                ? "bg-success/10 text-success"
                : channelStatus === "connecting"
                  ? "bg-warning/10 text-warning"
                  : "bg-destructive/10 text-destructive"
            }`}
          >
            {channelStatus === "connected" ? (
              <Wifi className="w-2.5 h-2.5" />
            ) : channelStatus === "connecting" ? (
              <RefreshCw className="w-2.5 h-2.5 animate-spin" />
            ) : (
              <WifiOff className="w-2.5 h-2.5" />
            )}
            {channelStatus}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {channelStatus === "disconnected" && (
            <button
              onClick={reconnect}
              title="Reconnect"
              className="p-1 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Share toggle */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="min-w-0 mr-3">
              <p className="text-xs font-semibold text-card-foreground">
                Share My Location
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                {sharing
                  ? myLocation
                    ? `${myLocation.lat.toFixed(4)}, ${myLocation.lng.toFixed(4)}`
                    : "Getting position…"
                  : channelStatus !== "connected"
                    ? "Connect first to start sharing"
                    : "Visible only to trip members"}
              </p>
            </div>
            <button
              onClick={sharing ? stopSharing : startSharing}
              disabled={!sharing && channelStatus !== "connected"}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                sharing
                  ? "bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20"
                  : "bg-primary text-primary-foreground hover:opacity-90"
              }`}
            >
              {sharing ? (
                <>
                  <LocateOff className="w-3.5 h-3.5" /> Stop
                </>
              ) : (
                <>
                  <Locate className="w-3.5 h-3.5" /> Start
                </>
              )}
            </button>
          </div>
          {sharing && (
            <div className="flex items-center gap-1.5 mt-2">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-[10px] text-success font-semibold">
                Broadcasting live · every 5 s
              </span>
            </div>
          )}
        </div>

        {/* Live Map */}
        {hasMapData && (
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <MapIcon className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-card-foreground">
                  Live Map
                </span>
                <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                  {activeMembersCount + (myLocation ? 1 : 0)} on map
                </span>
              </div>
              <button
                onClick={() => setShowMap((v) => !v)}
                className="text-[10px] text-primary font-semibold hover:underline"
              >
                {showMap ? "Hide" : "Show"}
              </button>
            </div>
            {showMap && (
              <div
                className="w-full rounded-xl overflow-hidden border border-border"
                style={{ height: 200 }}
              >
                <LiveMap members={members} myLocation={myLocation} />
              </div>
            )}
          </div>
        )}

        {/* Members list */}
        {members.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs font-semibold text-card-foreground">
              No one else is sharing yet
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Ask trip members to enable Live Location
            </p>
          </div>
        ) : (
          <div>
            {members.map((m) => {
              const isStale = Date.now() - m.timestamp > 5 * 60_000;
              const distFromMe =
                myLocation && !isStale
                  ? distanceKm(myLocation.lat, myLocation.lng, m.lat, m.lng)
                  : null;
              return (
                <div
                  key={m.userId}
                  className={`px-4 py-3 flex items-center gap-3 border-b border-border/50 last:border-0 ${isStale ? "opacity-50" : ""}`}
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: m.color }}
                  >
                    {m.initials}
                  </div>
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
                  <button
                    onClick={() => openInMaps(m)}
                    title={`Navigate to ${m.userName}`}
                    className="shrink-0 p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Google Maps link */}
        {members.length > 0 && myLocation && (
          <div className="px-4 py-3 border-t border-border bg-secondary/20">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${members.map((m) => `${m.lat},${m.lng}`).join("|")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-xs font-semibold text-primary hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View all on Google Maps
            </a>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-4 py-2.5 border-t border-border bg-secondary/10 shrink-0">
        <p className="text-[10px] text-muted-foreground text-center">
          🔒 Visible only to <strong>{tripName}</strong> members · Clears on
          leave
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Trigger button ── */}
      <button
        ref={btnRef}
        onClick={handleToggle}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
          sharing
            ? "border-success bg-success/10 text-success"
            : activeMembersCount > 0
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-card-foreground hover:bg-secondary"
        }`}
        title="Live Location Sharing"
      >
        <Radio className={`w-4 h-4 ${sharing ? "animate-pulse" : ""}`} />
        <span>Live</span>
        {activeMembersCount > 0 && (
          <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
            {activeMembersCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* ── Invisible backdrop ── */}
          <div
            className="fixed inset-0 z-[98]"
            onClick={() => setOpen(false)}
            aria-hidden
          />

          {/* ── Desktop panel — smart fixed position ── */}
          <div
            className="hidden md:flex fixed flex-col bg-card border border-border rounded-2xl shadow-2xl z-[99] animate-fade-in overflow-hidden"
            style={{
              top: panelPos.top,
              ...(panelPos.left !== undefined
                ? { left: panelPos.left }
                : { right: panelPos.right }),
              width: 400,
              maxHeight: "min(620px, 80vh)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {panelContent}
          </div>

          {/* ── Mobile bottom-sheet ── */}
          <div
            className="md:hidden fixed inset-0 z-[99] flex flex-col justify-end"
            onClick={() => setOpen(false)}
          >
            {/* Backdrop tint */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            {/* Sheet */}
            <div
              className="relative bg-card rounded-t-3xl shadow-2xl w-full flex flex-col animate-slide-in-from-bottom"
              style={{ maxHeight: "85vh" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-0 shrink-0">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>
              {panelContent}
              <div
                style={{ height: "env(safe-area-inset-bottom, 0px)" }}
                className="shrink-0"
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
