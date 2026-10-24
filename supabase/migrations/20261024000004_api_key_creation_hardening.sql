-- Enforce the per-account API key limit atomically so concurrent requests
-- cannot race past the limit or bypass it through PostgREST row pagination.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_integration_api_key(
  p_user_id UUID,
  p_name TEXT,
  p_key_prefix TEXT,
  p_key_hash TEXT,
  p_scopes TEXT[],
  p_expires_at TIMESTAMPTZ
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  key_prefix TEXT,
  scopes TEXT[],
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_active_count INTEGER;
  v_key_id UUID;
BEGIN
  IF p_user_id IS NULL
     OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 80
     OR p_key_prefix IS NULL OR p_key_prefix !~ '^rr_live_[A-Za-z0-9_-]{8,32}$'
     OR p_key_hash IS NULL OR p_key_hash !~ '^[a-f0-9]{64}$'
     OR p_scopes IS NULL OR cardinality(p_scopes) NOT BETWEEN 1 AND 6
     OR EXISTS (
       SELECT 1 FROM unnest(p_scopes) AS requested(scope)
       WHERE requested.scope <> ALL (ARRAY[
         'trips:read', 'trips:write', 'budget:read',
         'plans:generate', 'orders:read', 'orders:write'
       ]::TEXT[])
     )
     OR (p_expires_at IS NOT NULL AND (p_expires_at <= now() OR p_expires_at > now() + interval '365 days')) THEN
    RAISE EXCEPTION 'invalid API key arguments' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 918273));
  SELECT count(*)::INTEGER INTO v_active_count
  FROM public.integration_api_keys k
  WHERE k.user_id = p_user_id
    AND k.revoked_at IS NULL
    AND (k.expires_at IS NULL OR k.expires_at > now());

  IF v_active_count >= 10 THEN
    RAISE EXCEPTION 'active_api_key_limit_reached' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.integration_api_keys (user_id, name, key_prefix, key_hash, scopes, expires_at)
  VALUES (p_user_id, btrim(p_name), p_key_prefix, p_key_hash, ARRAY(SELECT DISTINCT unnest(p_scopes)), p_expires_at)
  RETURNING integration_api_keys.id INTO v_key_id;

  RETURN QUERY
  SELECT k.id, k.name, k.key_prefix, k.scopes, k.last_used_at, k.expires_at, k.revoked_at, k.created_at
  FROM public.integration_api_keys k
  WHERE k.id = v_key_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_integration_api_key(UUID, TEXT, TEXT, TEXT, TEXT[], TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_integration_api_key(UUID, TEXT, TEXT, TEXT, TEXT[], TIMESTAMPTZ) TO service_role;

COMMIT;
