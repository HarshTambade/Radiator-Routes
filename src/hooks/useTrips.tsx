import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mutateWithOfflineQueue, newId } from "@/lib/offlineMutation";
import { useAuth } from "./useAuth";

// Shared query options for offline persistence
// staleTime: data stays "fresh" for 10 min → no re-fetch on tab focus
// gcTime:    cache is kept for 24 h → survives page refresh in memory
const OFFLINE_QUERY_OPTIONS = {
  staleTime: 1000 * 60 * 10, // 10 minutes
  gcTime: 1000 * 60 * 60 * 24, // 24 hours
  retry: (failureCount: number, _error: unknown) => {
    // Don't retry when offline — just use stale cache
    if (!navigator.onLine) return false;
    return failureCount < 2;
  },
} as const;

export function useTrips() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["trips", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("*")
        .order("start_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    ...OFFLINE_QUERY_OPTIONS,
  });
}

export interface NewTrip {
  name: string;
  destination: string;
  country?: string;
  start_date: string;
  end_date: string;
  budget_total?: number;
  image_url?: string;
}

/**
 * Creates a trip, queueing the write when there is no signal.
 *
 * The id is generated client-side rather than left to the column default. A
 * queued insert cannot read back a server-generated key, so without this the
 * caller has nothing to navigate to and the offline path is useless in practice.
 * `trips.id` is a UUID with a default, so supplying one is equivalent.
 */
export function useCreateTrip() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (trip: NewTrip) => {
      const row = { ...trip, id: newId(), organizer_id: user!.id };

      const result = await mutateWithOfflineQueue(
        async () => {
          const { data, error } = await supabase
            .from("trips")
            .insert(row)
            .select()
            .single();
          if (error) throw error;
          return data;
        },
        {
          table: "trips",
          action: "insert",
          payload: row,
          matchValue: row.id,
          description: `Create trip "${trip.name}"`,
          invalidate: [["trips"]],
        },
      );

      // When queued, the row exists only in the queue. Returning the local copy
      // keeps the caller's contract — an object with an id it can route to —
      // and the same id lands on the server when the queue drains.
      return result.data ?? { ...row, queued: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
    },
  });
}

/**
 * Updates a trip, queueing when offline.
 *
 * `expectedUpdatedAt` makes the replay conditional: two organisers editing the
 * same trip no longer resolve by whoever reconnects last.
 */
export function useUpdateTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      patch,
      expectedUpdatedAt,
    }: {
      id: string;
      patch: Partial<NewTrip> & { status?: string; currency?: string };
      expectedUpdatedAt?: string;
    }) => {
      return mutateWithOfflineQueue(
        async () => {
          const { error } = await supabase
            .from("trips")
            .update(patch)
            .eq("id", id);
          if (error) throw error;
        },
        {
          table: "trips",
          action: "update",
          payload: patch,
          matchValue: id,
          expectedUpdatedAt,
          description: `Update trip ${patch.name ? `"${patch.name}"` : id}`,
          invalidate: [["trips"], ["trip", id]],
        },
      );
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      queryClient.invalidateQueries({ queryKey: ["trip", variables.id] });
    },
  });
}

export function useTrip(tripId: string | undefined) {
  return useQuery({
    queryKey: ["trip", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("*")
        .eq("id", tripId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!tripId,
    ...OFFLINE_QUERY_OPTIONS,
  });
}

export function useItineraries(tripId: string | undefined) {
  return useQuery({
    queryKey: ["itineraries", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("itineraries")
        .select("*")
        .eq("trip_id", tripId!)
        .order("version", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!tripId,
    ...OFFLINE_QUERY_OPTIONS,
  });
}

export function useActivities(itineraryId: string | undefined) {
  return useQuery({
    queryKey: ["activities", itineraryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("*")
        .eq("itinerary_id", itineraryId!)
        .order("start_time", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!itineraryId,
    ...OFFLINE_QUERY_OPTIONS,
  });
}
