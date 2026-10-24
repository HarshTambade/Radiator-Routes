-- Close authorization gaps and add per-user provider quotas for server proxies.
BEGIN;

-- Invite codes are bearer secrets. Only members can list their trip's invites;
-- outsiders may resolve one code through the constrained lookup function.
DROP POLICY IF EXISTS "Anyone can read invite by code" ON public.trip_invites;
DROP POLICY IF EXISTS "Members can view trip invites" ON public.trip_invites;
CREATE POLICY "Members can view trip invites"
  ON public.trip_invites FOR SELECT
  USING (public.is_trip_member(trip_id));

CREATE OR REPLACE FUNCTION public.lookup_trip_invite(p_invite_code TEXT)
RETURNS TABLE (
  id UUID,
  trip_id UUID,
  invite_code TEXT,
  status TEXT,
  max_uses INTEGER,
  uses INTEGER,
  expires_at TIMESTAMPTZ,
  trip_name TEXT,
  destination TEXT,
  start_date DATE,
  end_date DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT i.id, i.trip_id, i.invite_code, i.status, i.max_uses, i.uses,
         i.expires_at, t.name, t.destination, t.start_date, t.end_date
  FROM public.trip_invites i
  JOIN public.trips t ON t.id = i.trip_id
  WHERE i.invite_code = p_invite_code
    AND i.status IN ('active', 'pending')
    AND (i.expires_at IS NULL OR i.expires_at > now())
    AND (i.max_uses IS NULL OR i.uses < i.max_uses)
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.lookup_trip_invite(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_trip_invite(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_valid_trip_invite(p_invite_id UUID, p_trip_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_invites i
    WHERE i.id = p_invite_id
      AND i.trip_id = p_trip_id
      AND i.status IN ('active', 'pending')
      AND (i.expires_at IS NULL OR i.expires_at > now())
      AND (i.max_uses IS NULL OR i.uses < i.max_uses)
  );
$$;
REVOKE ALL ON FUNCTION public.is_valid_trip_invite(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_trip_invite(UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS "Users can create join requests" ON public.trip_join_requests;
CREATE POLICY "Users can create join requests"
  ON public.trip_join_requests FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND invite_id IS NOT NULL
    AND public.is_valid_trip_invite(invite_id, trip_id)
  );

-- Membership is organizer-controlled. The old self-insert policy let any
-- signed-in user join a trip by supplying its UUID.
DROP POLICY IF EXISTS "Users can add own membership" ON public.trip_memberships;

-- Private communities must not be joinable by self-inserting a membership.
CREATE OR REPLACE FUNCTION public.is_community_public(p_community_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.communities c
    WHERE c.id = p_community_id AND c.is_public
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_community_event(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_events e
    JOIN public.communities c ON c.id = e.community_id
    WHERE e.id = p_event_id
      AND (c.is_public OR public.is_community_member(c.id))
  );
$$;

DROP POLICY IF EXISTS "Anyone can view public communities" ON public.communities;
CREATE POLICY "Anyone can view public communities"
  ON public.communities FOR SELECT
  USING (is_public OR created_by = auth.uid() OR public.is_community_member(id));

DROP POLICY IF EXISTS "Anyone can view community members" ON public.community_memberships;
DROP POLICY IF EXISTS "Visible community members" ON public.community_memberships;
CREATE POLICY "Visible community members"
  ON public.community_memberships FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_community_member(community_id)
    OR public.is_community_public(community_id)
  );

DROP POLICY IF EXISTS "Users can join communities" ON public.community_memberships;
CREATE POLICY "Users can join communities"
  ON public.community_memberships FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND role = 'member'
    AND public.is_community_public(community_id)
  );

DROP POLICY IF EXISTS "Members can view events" ON public.community_events;
CREATE POLICY "Members can view events"
  ON public.community_events FOR SELECT
  USING (public.is_community_public(community_id) OR public.is_community_member(community_id));

DROP POLICY IF EXISTS "Members can view RSVPs" ON public.event_rsvps;
CREATE POLICY "Members can view RSVPs"
  ON public.event_rsvps FOR SELECT
  USING (public.can_view_community_event(event_id));

DROP POLICY IF EXISTS "Users can RSVP" ON public.event_rsvps;
CREATE POLICY "Users can RSVP"
  ON public.event_rsvps FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_view_community_event(event_id));

DROP POLICY IF EXISTS "Users can update own RSVP" ON public.event_rsvps;
CREATE POLICY "Users can update own RSVP"
  ON public.event_rsvps FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.can_view_community_event(event_id));

-- Authenticated Edge proxies consume both a minute and a daily quota. Service
-- role can write/read counters; client roles receive no table or RPC access.
CREATE OR REPLACE FUNCTION public.list_accessible_trips(
  p_user_id UUID, p_limit INTEGER, p_offset INTEGER
)
RETURNS SETOF public.trips
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT t.*
  FROM public.trips t
  WHERE t.organizer_id = p_user_id
     OR EXISTS (
       SELECT 1 FROM public.trip_memberships m
       WHERE m.trip_id = t.id AND m.user_id = p_user_id
     )
  ORDER BY t.start_date ASC, t.id ASC
  LIMIT p_limit OFFSET p_offset;
$$;
REVOKE ALL ON FUNCTION public.list_accessible_trips(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_accessible_trips(UUID, INTEGER, INTEGER) TO service_role;

CREATE TABLE IF NOT EXISTS public.provider_request_rate_limits (
  subject_key TEXT NOT NULL CHECK (length(subject_key) BETWEEN 1 AND 50),
  provider TEXT NOT NULL CHECK (provider IN ('groq', 'ors', 'opentripmap', 'planner')),
  bucket TEXT NOT NULL CHECK (bucket IN ('minute', 'day')),
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (subject_key, provider, bucket, window_start)
);
ALTER TABLE public.provider_request_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_request_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.provider_request_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_provider_request_rate_limit(
  p_user_id UUID,
  p_provider TEXT,
  p_bucket TEXT,
  p_user_limit INTEGER,
  p_project_limit INTEGER
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, resets_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_window TIMESTAMPTZ;
  v_user_count INTEGER;
  v_project_count INTEGER;
  v_reset TIMESTAMPTZ;
BEGIN
  IF p_user_id IS NULL OR p_provider IS NULL OR p_bucket IS NULL
     OR p_user_limit IS NULL OR p_project_limit IS NULL
     OR p_provider NOT IN ('groq', 'ors', 'opentripmap', 'planner')
     OR p_bucket NOT IN ('minute', 'day')
     OR p_user_limit < 1 OR p_user_limit > 10000
     OR p_project_limit < 1 OR p_project_limit > 1000000 THEN
    RAISE EXCEPTION 'invalid rate limit arguments' USING ERRCODE = '22023';
  END IF;

  v_window := CASE p_bucket
    WHEN 'minute' THEN date_trunc('minute', now())
    ELSE date_trunc('day', now())
  END;
  v_reset := CASE p_bucket
    WHEN 'minute' THEN v_window + interval '1 minute'
    ELSE v_window + interval '1 day'
  END;

  INSERT INTO public.provider_request_rate_limits AS limits
    (subject_key, provider, bucket, window_start, request_count)
  VALUES ('user:' || p_user_id::TEXT, p_provider, p_bucket, v_window, 1)
  ON CONFLICT (subject_key, provider, bucket, window_start)
  DO UPDATE SET request_count = limits.request_count + 1
  WHERE limits.request_count < p_user_limit
  RETURNING request_count INTO v_user_count;
  IF NOT FOUND THEN
    SELECT request_count INTO v_user_count FROM public.provider_request_rate_limits
    WHERE subject_key = 'user:' || p_user_id::TEXT AND provider = p_provider
      AND bucket = p_bucket AND window_start = v_window;
    RETURN QUERY SELECT FALSE, 0, v_reset;
    RETURN;
  END IF;

  INSERT INTO public.provider_request_rate_limits AS limits
    (subject_key, provider, bucket, window_start, request_count)
  VALUES ('project', p_provider, p_bucket, v_window, 1)
  ON CONFLICT (subject_key, provider, bucket, window_start)
  DO UPDATE SET request_count = limits.request_count + 1
  WHERE limits.request_count < p_project_limit
  RETURNING request_count INTO v_project_count;
  IF NOT FOUND THEN
    SELECT request_count INTO v_project_count FROM public.provider_request_rate_limits
    WHERE subject_key = 'project' AND provider = p_provider
      AND bucket = p_bucket AND window_start = v_window;
    RETURN QUERY SELECT FALSE, 0, v_reset;
    RETURN;
  END IF;

  IF random() < 0.01 THEN
    DELETE FROM public.provider_request_rate_limits
    WHERE window_start < now() - interval '2 days';
  END IF;

  RETURN QUERY SELECT TRUE,
    greatest(0, least(p_user_limit - v_user_count, p_project_limit - v_project_count)),
    v_reset;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_provider_request_rate_limit(UUID, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_provider_request_rate_limit(UUID, TEXT, TEXT, INTEGER, INTEGER) TO service_role;

COMMIT;
