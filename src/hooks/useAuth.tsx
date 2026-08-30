import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

/**
 * Caches holding data scoped to the signed-in user. Anonymous caches (map
 * tiles, fonts, Wikipedia, weather) are deliberately kept so the app still
 * works offline for the next session.
 */
const USER_SCOPED_CACHES = ["supabase-rest", "supabase-api"];

async function purgeUserScopedCaches() {
  if (!("caches" in window)) return;
  try {
    await Promise.all(USER_SCOPED_CACHES.map((name) => caches.delete(name)));
  } catch {
    // Best-effort: a failed purge must not block sign-out.
  }
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    // The service worker caches Supabase REST responses per URL, so rows from
    // this session would otherwise survive logout and could be served to the
    // next person using the device. Purge the user-scoped caches.
    await purgeUserScopedCaches();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
