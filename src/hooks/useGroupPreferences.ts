import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  preferencesFromProfile,
  type MemberPreferences,
} from "@/lib/groupRegret";

/**
 * Loads the real membership of a trip and each member's stated preferences.
 *
 * This exists because the regret planner previously hardcoded `travelers: 2`
 * and a fixed interest list, so actual group composition was never read even
 * though `trip_memberships` and `profiles.preferences` both hold it.
 *
 * Falls back to a single synthetic member when membership can't be loaded —
 * offline, or a trip with no rows yet — so scoring degrades instead of failing.
 */
export function useGroupPreferences(tripId?: string) {
  const [members, setMembers] = useState<MemberPreferences[]>([]);
  const [loading, setLoading] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);

  const load = useCallback(async () => {
    if (!tripId) {
      setMembers([]);
      return;
    }

    setLoading(true);
    setUsedFallback(false);

    try {
      const { data: memberships, error: membershipError } = await supabase
        .from("trip_memberships")
        .select("user_id")
        .eq("trip_id", tripId);

      if (membershipError) throw membershipError;

      const userIds = (memberships ?? [])
        .map((row) => (row as { user_id?: string }).user_id)
        .filter((id): id is string => typeof id === "string");

      if (userIds.length === 0) {
        setMembers([]);
        setUsedFallback(true);
        return;
      }

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, name, preferences")
        .in("id", userIds);

      if (profileError) throw profileError;

      const byId = new Map(
        (profiles ?? []).map((p) => [(p as { id: string }).id, p]),
      );

      // Keep every member even if their profile row is missing — an absent
      // profile means "no stated preferences", which is a valid input.
      setMembers(
        userIds.map((id, index) => {
          const profile = byId.get(id);
          return profile
            ? preferencesFromProfile(profile, id)
            : { id, name: `Traveller ${index + 1}` };
        }),
      );
    } catch {
      setMembers([]);
      setUsedFallback(true);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    members,
    loading,
    /** True when real membership could not be read and scoring is degraded. */
    usedFallback,
    memberCount: members.length,
    reload: load,
  };
}

export default useGroupPreferences;
