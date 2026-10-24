-- Stop counting requests after an API key reaches its per-minute limit.
-- This also protects deployments that already applied the initial platform API
-- migration before the bounded counter was added to the schema snapshot.
CREATE OR REPLACE FUNCTION public.consume_integration_api_rate_limit(
  p_api_key_id UUID,
  p_limit INTEGER DEFAULT 60
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, resets_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_window TIMESTAMPTZ := date_trunc('minute', now());
  v_count INTEGER;
BEGIN
  IF p_api_key_id IS NULL OR p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'invalid API rate limit arguments' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.integration_api_rate_limits (api_key_id, window_start, request_count)
  VALUES (p_api_key_id, v_window, 1)
  ON CONFLICT (api_key_id, window_start)
  DO UPDATE SET request_count = public.integration_api_rate_limits.request_count + 1
  WHERE public.integration_api_rate_limits.request_count < p_limit
  RETURNING request_count INTO v_count;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0, v_window + interval '1 minute';
    RETURN;
  END IF;

  IF random() < 0.01 THEN
    DELETE FROM public.integration_api_rate_limits
    WHERE window_start < now() - interval '2 days';
  END IF;

  RETURN QUERY SELECT TRUE, greatest(0, p_limit - v_count), v_window + interval '1 minute';
END;
$$;

REVOKE ALL ON FUNCTION public.consume_integration_api_rate_limit(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_integration_api_rate_limit(UUID, INTEGER)
  TO service_role;
