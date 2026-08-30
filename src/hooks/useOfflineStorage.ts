import { useCallback, useEffect, useState } from "react";

type SyncStatus = "idle" | "syncing" | "success" | "error";

interface OfflineQueueItem {
  id: string;
  type: "trip" | "itinerary" | "message" | "action";
  action: string;
  data: Record<string, unknown>;
  timestamp: number;
}

interface OfflineCache {
  trips: Record<string, unknown>;
  places: Record<string, unknown>;
  user: Record<string, unknown>;
  lastSync: number | null;
}

export function useOfflineStorage() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [queue, setQueue] = useState<OfflineQueueItem[]>([]);
  const [cache, setCache] = useState<OfflineCache>({
    trips: {},
    places: {},
    user: {},
    lastSync: null,
  });

  useEffect(() => {
    const loadCache = () => {
      const storedCache = localStorage.getItem("radiator-cache");
      const storedQueue = localStorage.getItem("radiator-queue");
      
      if (storedCache) {
        setCache(JSON.parse(storedCache));
      }
      if (storedQueue) {
        setQueue(JSON.parse(storedQueue));
      }
    };

    loadCache();
  }, []);

  const saveCache = useCallback((newCache: OfflineCache) => {
    localStorage.setItem("radiator-cache", JSON.stringify(newCache));
    setCache(newCache);
  }, []);

  const addToQueue = useCallback((item: OfflineQueueItem) => {
    const newQueue = [...queue, item];
    setQueue(newQueue);
    localStorage.setItem("radiator-queue", JSON.stringify(newQueue));
  }, [queue]);

  const removeFromQueue = useCallback((id: string) => {
    const newQueue = queue.filter((item) => item.id !== id);
    setQueue(newQueue);
    localStorage.setItem("radiator-queue", JSON.stringify(newQueue));
  }, [queue]);

  const syncQueue = useCallback(async (supabase: any) => {
    setSyncStatus("syncing");
    const queueCopy = [...queue];
    
    for (const item of queueCopy) {
      try {
        switch (item.type) {
          case "trip":
            if (item.action === "create") {
              await supabase.from("trips").insert(item.data);
            } else if (item.action === "update") {
              await supabase.from("trips").update(item.data).eq("id", item.data.id);
            }
            break;
          case "itinerary":
            if (item.action === "create") {
              await supabase.from("itinerary_items").insert(item.data);
            } else if (item.action === "update") {
              await supabase.from("itinerary_items").update(item.data).eq("id", item.data.id);
            }
            break;
          case "message":
            await supabase.from("messages").insert(item.data);
            break;
        }
        removeFromQueue(item.id);
      } catch (error) {
        console.error("Sync failed:", error);
        setSyncStatus("error");
        return;
      }
    }
    
    saveCache({
      ...cache,
      lastSync: Date.now(),
    });
    setSyncStatus("success");
    
    setTimeout(() => setSyncStatus("idle"), 3000);
  }, [queue, removeFromQueue, saveCache, cache]);

  const cacheData = useCallback((type: "trips" | "places" | "user", key: string, data: unknown) => {
    const newCache = { ...cache };
    newCache[type][key] = data;
    saveCache(newCache);
  }, [cache, saveCache]);

  const getCachedData = useCallback((type: "trips" | "places" | "user", key: string) => {
    return cache[type][key];
  }, [cache]);

  return {
    isOnline: navigator.onLine,
    syncStatus,
    queue,
    addToQueue,
    removeFromQueue,
    syncQueue,
    cacheData,
    getCachedData,
    hasOfflineData: queue.length > 0,
  };
}

export function useServiceWorkerUpdate() {
  const [hasUpdate, setHasUpdate] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.ready.then((registration) => {
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            setHasUpdate(true);
          }
        });
      });
    });

    const interval = setInterval(() => {
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration && registration.waiting) {
          setHasUpdate(true);
        }
      });
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const update = useCallback(() => {
    if (hasUpdate) {
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration && registration.waiting) {
          registration.waiting.postMessage("SKIP_WAITING");
          window.location.reload();
        }
      });
    }
  }, [hasUpdate]);

  return { hasUpdate, update };
}

export default useOfflineStorage;
