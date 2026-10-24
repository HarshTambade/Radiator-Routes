-- External API credentials, booking requests, and atomic per-key rate limits.
-- Secrets are stored only as SHA-256 hashes; the raw key is shown once at creation.

CREATE TABLE IF NOT EXISTS public.integration_api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  key_prefix      TEXT NOT NULL,
  key_hash        TEXT NOT NULL UNIQUE,
  scopes          TEXT[] NOT NULL DEFAULT '{}',
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_api_keys_user_created
  ON public.integration_api_keys (user_id, created_at DESC);

ALTER TABLE public.integration_api_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integration_api_keys FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.integration_api_keys TO service_role;

CREATE TABLE IF NOT EXISTS public.integration_api_rate_limits (
  api_key_id      UUID NOT NULL REFERENCES public.integration_api_keys(id) ON DELETE CASCADE,
  window_start    TIMESTAMPTZ NOT NULL,
  request_count   INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (api_key_id, window_start)
);

ALTER TABLE public.integration_api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integration_api_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.integration_api_rate_limits TO service_role;

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
  INSERT INTO public.integration_api_rate_limits (api_key_id, window_start, request_count)
  VALUES (p_api_key_id, v_window, 1)
  ON CONFLICT (api_key_id, window_start)
  DO UPDATE SET request_count = public.integration_api_rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  -- Opportunistic cleanup keeps the table bounded without requiring pg_cron.
  IF random() < 0.01 THEN
    DELETE FROM public.integration_api_rate_limits
    WHERE window_start < now() - interval '2 days';
  END IF;

  RETURN QUERY SELECT v_count <= p_limit, greatest(0, p_limit - v_count), v_window + interval '1 minute';
END;
$$;

REVOKE ALL ON FUNCTION public.consume_integration_api_rate_limit(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_integration_api_rate_limit(UUID, INTEGER) TO service_role;

CREATE TABLE IF NOT EXISTS public.travel_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id           UUID REFERENCES public.trips(id) ON DELETE SET NULL,
  order_type        TEXT NOT NULL CHECK (order_type IN ('flight', 'hotel', 'activity', 'transport', 'package', 'other')),
  item_name         TEXT NOT NULL CHECK (length(item_name) BETWEEN 1 AND 160),
  provider          TEXT CHECK (provider IS NULL OR length(provider) <= 100),
  status            TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'cancelled', 'failed')),
  currency          TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  quoted_amount     NUMERIC(12,2) CHECK (quoted_amount IS NULL OR quoted_amount >= 0),
  details           JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  idempotency_key   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT travel_orders_user_idempotency_unique UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_travel_orders_user_created
  ON public.travel_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_travel_orders_trip_created
  ON public.travel_orders (trip_id, created_at DESC);

ALTER TABLE public.travel_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.travel_orders FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.travel_orders TO service_role;

DROP TRIGGER IF EXISTS update_travel_orders_updated_at ON public.travel_orders;
CREATE TRIGGER update_travel_orders_updated_at
  BEFORE UPDATE ON public.travel_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
