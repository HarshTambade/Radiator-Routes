import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  adaptClient,
  onQueueChange,
  pendingMutationCount,
  syncQueuedMutations,
} from "@/lib/offlineMutation";
import { useOnlineStatus } from "./useOfflineTrip";

export type SyncPhase = "idle" | "syncing" | "synced" | "partial";

/**
 * Drains the offline mutation queue whenever connectivity returns, and exposes
 * how many changes are still waiting.
 *
 * Mount this once, high in the tree. It is the counterpart to
 * `mutateWithOfflineQueue`: without it, queued edits would accumulate and never
 * replay.
 */
export function useOfflineSync() {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(0);
  const [phase, setPhase] = useState<SyncPhase>("idle");
  const wasOffline = useRef(false);

  const refreshCount = useCallback(async () => {
    try {
      setPending(await pendingMutationCount());
    } catch {
      /* IndexedDB unavailable — treat as nothing pending */
    }
  }, []);

  const drain = useCallback(async () => {
    if (!navigator.onLine) return;

    let count = 0;
    try {
      count = await pendingMutationCount();
    } catch {
      return;
    }
    if (count === 0) return;

    setPhase("syncing");
    try {
      const outcome = await syncQueuedMutations(adaptClient(supabase));

      // Invalidate only the keys the replayed writes actually touched, so an
      // unrelated view isn't forced to refetch.
      const seen = new Set<string>();
      for (const key of outcome.invalidate) {
        const serialised = JSON.stringify(key);
        if (seen.has(serialised)) continue;
        seen.add(serialised);
        queryClient.invalidateQueries({ queryKey: key });
      }

      setPhase(outcome.failed > 0 ? "partial" : "synced");
      window.setTimeout(() => setPhase("idle"), 4000);
    } catch {
      setPhase("idle");
    } finally {
      refreshCount();
    }
  }, [queryClient, refreshCount]);

  // Keep the badge accurate as mutations are queued or replayed.
  useEffect(() => {
    refreshCount();
    return onQueueChange(refreshCount);
  }, [refreshCount]);

  // Drain on reconnect, and once on mount in case a previous session left work.
  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true;
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      drain();
    }
  }, [isOnline, drain]);

  useEffect(() => {
    if (navigator.onLine) drain();
    // Intentionally mount-only: this is the "left over from last session" sweep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    pending,
    phase,
    hasPending: pending > 0,
    /** Force a drain attempt, e.g. from a retry button. */
    syncNow: drain,
  };
}

export default useOfflineSync;
