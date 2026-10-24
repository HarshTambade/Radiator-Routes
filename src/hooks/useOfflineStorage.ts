import { useCallback, useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
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
 * Registers the app's service worker, exposes a user-confirmed update action,
 * and prunes TTL-expired IndexedDB records on mount.
 */
export function useServiceWorkerUpdate() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const {
    needRefresh: [hasUpdate],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW: (_serviceWorkerUrl, nextRegistration) => {
      if (nextRegistration) setRegistration(nextRegistration);
    },
  });

  useEffect(() => {
    clearExpiredCaches().catch(() => {
      /* cache pruning is best-effort */
    });

    // Earlier app versions cached authenticated Supabase REST responses. Drop
    // that cache when users upgrade so stale private data is not left behind.
    if ("caches" in window) {
      window.caches.delete("supabase-rest").catch(() => {
        /* Cache Storage may be disabled by the browser */
      });
    }
  }, []);

  useEffect(() => {
    if (!registration) return;

    // Poll hourly so long-lived sessions can discover a new deploy without
    // interrupting a trip form or replacing the current page automatically.
    const interval = setInterval(
      () => {
        if (navigator.onLine) {
          registration.update().catch(() => {
            /* offline or temporarily unavailable — retry next tick */
          });
        }
      },
      60 * 60 * 1000,
    );

    return () => clearInterval(interval);
  }, [registration]);

  const update = useCallback(() => updateServiceWorker(true), [updateServiceWorker]);
  const dismissOfflineReady = useCallback(() => setOfflineReady(false), [setOfflineReady]);

  return { hasUpdate, offlineReady, dismissOfflineReady, update };
}

export default useOfflineStorage;
