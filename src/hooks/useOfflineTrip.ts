import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  saveTripOffline,
  getOfflineTripData,
  getAllOfflineTrips,
  removeOfflineTrip,
  isTripOffline,
  precacheMapTiles,
  type OfflineTripData,
} from "@/services/offlineTrip";

// ── useOfflineTrip ─────────────────────────────────────────────────────────────
// Manages saving / removing a single trip offline (IndexedDB + map tiles)

export function useOfflineTrip(tripId?: string) {
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tileProgress, setTileProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [tilesCached, setTilesCached] = useState(false);
  const [tileCacheCount, setTileCacheCount] = useState(0);

  // Load current offline status on mount / tripId change
  useEffect(() => {
    if (!tripId) return;
    isTripOffline(tripId).then((saved) => {
      setIsSaved(saved);
      if (saved) {
        getOfflineTripData(tripId).then((data) => {
          if (data) {
            setSavedAt(data.savedAt);
            setTilesCached(data.tilesCached);
            setTileCacheCount(data.tileCacheCount ?? 0);
          }
        });
      }
    });
  }, [tripId]);

  /** Save the trip (+ itineraries + activities + map tiles) to IndexedDB */
  const saveOffline = useCallback(
    async (trip: Record<string, unknown>) => {
      if (!tripId) return;
      setSaving(true);
      setTileProgress(null);

      try {
        // ── 1. Fetch itineraries ────────────────────────────────────────────
        const { data: itineraries } = await supabase
          .from("itineraries")
          .select("*")
          .eq("trip_id", tripId)
          .order("version", { ascending: false });

        // ── 2. Fetch activities for all itineraries ─────────────────────────
        let activities: Record<string, unknown>[] = [];
        if (itineraries && itineraries.length > 0) {
          const itinIds = itineraries.map((i) => (i as Record<string, unknown>).id as string);
          const { data: acts } = await supabase
            .from("activities")
            .select("*")
            .in("itinerary_id", itinIds)
            .order("start_time", { ascending: true });
          activities = (acts as Record<string, unknown>[]) ?? [];
        }

        // ── 3. Geocode destination for map tile coordinates ─────────────────
        let lat: number | undefined;
        let lng: number | undefined;

        const destination = trip.destination as string;
        const country = trip.country as string | undefined;

        if (destination) {
          try {
            const query = country
              ? `${destination}, ${country}`
              : destination;
            const res = await fetch(
              `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
              { headers: { "Accept-Language": "en" } },
            );
            if (res.ok) {
              const geo = await res.json();
              if (geo.length > 0) {
                lat = parseFloat(geo[0].lat);
                lng = parseFloat(geo[0].lon);
              }
            }
          } catch {
            // geo optional — tiles still cached if activity coords available
          }
        }

        // Fallback: use first activity's lat/lng
        if ((lat === undefined || lng === undefined) && activities.length > 0) {
          for (const act of activities) {
            const aLat = act.location_lat as number | null;
            const aLng = act.location_lng as number | null;
            if (aLat && aLng) {
              lat = aLat;
              lng = aLng;
              break;
            }
          }
        }

        // ── 4. Persist to IndexedDB ─────────────────────────────────────────
        const offlineData: OfflineTripData = {
          tripId,
          trip,
          itineraries: (itineraries as Record<string, unknown>[]) ?? [],
          activities,
          savedAt: Date.now(),
          destinationLat: lat,
          destinationLng: lng,
          tilesCached: false,
          tileCacheCount: 0,
        };

        await saveTripOffline(offlineData);

        // ── 5. Pre-cache map tiles if we have coordinates ───────────────────
        let cachedCount = 0;
        if (lat !== undefined && lng !== undefined) {
          cachedCount = await precacheMapTiles(lat, lng, (done, total) => {
            setTileProgress({ done, total });
          });
          offlineData.tilesCached = cachedCount > 0;
          offlineData.tileCacheCount = cachedCount;
          await saveTripOffline(offlineData); // update with tile metadata
        }

        setIsSaved(true);
        setSavedAt(offlineData.savedAt);
        setTilesCached(offlineData.tilesCached);
        setTileCacheCount(cachedCount);
      } finally {
        setSaving(false);
        setTileProgress(null);
      }
    },
    [tripId],
  );

  /** Remove the offline copy from IndexedDB */
  const removeOffline = useCallback(async () => {
    if (!tripId) return;
    await removeOfflineTrip(tripId);
    setIsSaved(false);
    setSavedAt(null);
    setTilesCached(false);
    setTileCacheCount(0);
  }, [tripId]);

  return {
    isSaved,
    saving,
    tileProgress,
    savedAt,
    tilesCached,
    tileCacheCount,
    saveOffline,
    removeOffline,
  };
}

// ── useAllOfflineTrips ─────────────────────────────────────────────────────────
// Returns a list of all locally-saved offline trips

export function useAllOfflineTrips() {
  const [offlineTrips, setOfflineTrips] = useState<OfflineTripData[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const trips = await getAllOfflineTrips();
      setOfflineTrips(trips);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const remove = useCallback(
    async (tripId: string) => {
      await removeOfflineTrip(tripId);
      setOfflineTrips((prev) => prev.filter((t) => t.tripId !== tripId));
    },
    [],
  );

  return { offlineTrips, loading, refresh, remove };
}

// ── useOnlineStatus ────────────────────────────────────────────────────────────
// Simple hook to track navigator.onLine

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return isOnline;
}
