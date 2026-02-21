import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

// Shared query options for offline persistence
// staleTime: data stays "fresh" for 10 min → no re-fetch on tab focus
// gcTime:    cache is kept for 24 h → survives page refresh in memory
const OFFLINE_QUERY_OPTIONS = {
  staleTime: 1000 * 60 * 10, // 10 minutes
  gcTime: 1000 * 60 * 60 * 24, // 24 hours
  retry: (failureCount: number, error: unknown) => {
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

export function useCreateTrip() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (trip: {
      name: string;
      destination: string;
      country?: string;
      start_date: string;
      end_date: string;
      budget_total?: number;
      image_url?: string;
    }) => {
      const { data, error } = await supabase
        .from("trips")
        .insert({ ...trip, organizer_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
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
