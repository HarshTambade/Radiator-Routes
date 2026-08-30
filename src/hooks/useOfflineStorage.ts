import { useCallback, useEffect, useState } from "react";
import {
  getOfflineQueue,
  saveToOfflineQueue,
  updateOfflineQueue,
  type StoredRecord,
} from "@/lib/idb";
import { clearExpiredCaches, getCacheStats } from "@/lib/offlineCache";

export type SyncStatus = "idle" | "syncing" | "success" | "error";

export type QueuedAction = "create" | "update" | "delete";
export type QueuedEntity = "trip" | "itinerary" | "activity" | "message" | "expense";

export interface OfflineQueueItem extends StoredRecord {
  entity: QueuedEntity;
  action: QueuedAction;
  table: string;
  payload: Record<string, unknown>;
}

/** Minimal shape of the Supabase client surface this hook needs. */
interface QueueWriter {
  from(table: string): {
    insert(values: Record<string, unknown>): Promise<{ error: unknown }>;
    update(values: Record<string, unknown>): {
      eq(column: string, value: unknown): Promise<{ error: unknown }>;
    };
    delete(): { eq(column: string, value: unknown): Promise<{ error: unknown }> };
  };
}

/**
 * Durable queue for mutations made while offline, backed by the `offlineQueue`
 * IndexedDB store. Enqueue with `enqueue`, drain with `sync` once back online.
 *
 * Read-side offline trip caching lives in `useOfflineTrip` / `services/offlineTrip`.
 */
export function useOfflineStorage() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [queue, setQueue] = useState<OfflineQueueItem[]>([]);

  const refresh = useCallback(async () => {
    const pending = (await getOfflineQueue()) as OfflineQueueItem[];
    setQueue(pending);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enqueue = useCallback(
    async (item: Omit<OfflineQueueItem, "id">) => {
      await saveToOfflineQueue({ ...item, id: crypto.randomUUID() });
      await refresh();
    },
    [refresh],
  );

  const sync = useCallback(
    async (client: QueueWriter) => {
      const pending = (await getOfflineQueue()) as OfflineQueueItem[];
      if (pending.length === 0) return;

      setSyncStatus("syncing");
      let failed = false;

      for (const item of pending) {
        try {
          const table = client.from(item.table);
          const { error } =
            item.action === "create"
              ? await table.insert(item.payload)
              : item.action === "update"
                ? await table.update(item.payload).eq("id", item.payload.id)
                : await table.delete().eq("id", item.payload.id);

          if (error) throw error;
          await updateOfflineQueue(item.id, "completed");
        } catch {
          await updateOfflineQueue(item.id, "failed");
          failed = true;
        }
      }

      await refresh();
      setSyncStatus(failed ? "error" : "success");
      setTimeout(() => setSyncStatus("idle"), 3000);
    },
    [refresh],
  );

  return {
    syncStatus,
    queue,
    pendingCount: queue.length,
    hasOfflineData: queue.length > 0,
    enqueue,
    sync,
    refresh,
    getCacheStats,
  };
}

/**
 * Detects a waiting service worker and exposes a one-call `update()` that
 * activates it and reloads. Also prunes TTL-expired IndexedDB records on mount.
 */
export function useServiceWorkerUpdate() {
  const [hasUpdate, setHasUpdate] = useState(false);

  useEffect(() => {
    clearExpiredCaches().catch(() => {
      /* cache pruning is best-effort */
    });

    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    const watch = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting) setHasUpdate(true);

      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            if (!cancelled) setHasUpdate(true);
          }
        });
      });
    };

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (registration && !cancelled) watch(registration);
    });

    // Poll hourly so long-lived sessions still pick up a new deploy.
    const interval = setInterval(
      () => {
        navigator.serviceWorker.getRegistration().then((registration) => {
          registration?.update().catch(() => {
            /* offline — retry next tick */
          });
          if (registration?.waiting && !cancelled) setHasUpdate(true);
        });
      },
      60 * 60 * 1000,
    );

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const update = useCallback(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration?.waiting) return;
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
    window.location.reload();
  }, []);

  return { hasUpdate, update };
}

export default useOfflineStorage;
