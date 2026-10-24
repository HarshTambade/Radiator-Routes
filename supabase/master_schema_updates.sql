-- Atlas AI additive schema updates
--
-- Apply this file to an existing Supabase project whose base schema is already
-- installed. It contains the database additions reflected in master_schema.sql:
-- friends, direct messages, shared expenses, and external platform API support.
-- The statements are safe to re-run. This file can be run from the Supabase SQL
-- Editor; CLI users can apply the corresponding files in supabase/migrations.

BEGIN;

-- ---------------------------------------------------------------------------
-- Friends, direct messages, and shared expenses
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.friend_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sender_id, receiver_id)
);
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.group_expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  paid_by     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency    TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  category    TEXT NOT NULL DEFAULT 'general'
              CHECK (category IN ('accommodation', 'food', 'transport', 'activity', 'shopping', 'general', 'other')),
  split_type  TEXT NOT NULL DEFAULT 'equal'
              CHECK (split_type IN ('equal', 'custom', 'percentage')),
  split_with  UUID[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.group_expenses ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.expense_splits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id  UUID NOT NULL REFERENCES public.group_expenses(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  percentage  NUMERIC(5,2),
  settled     BOOLEAN NOT NULL DEFAULT false,
  settled_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (expense_id, user_id)
);
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;

-- Enforce amount and currency validation on pre-existing tables too. NOT VALID
-- avoids blocking the update on historical rows while enforcing new writes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.group_expenses'::regclass
      AND conname = 'group_expenses_amount_nonnegative'
  ) THEN
    ALTER TABLE public.group_expenses
      ADD CONSTRAINT group_expenses_amount_nonnegative CHECK (amount >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.group_expenses'::regclass
      AND conname = 'group_expenses_currency_format'
  ) THEN
    ALTER TABLE public.group_expenses
      ADD CONSTRAINT group_expenses_currency_format CHECK (currency ~ '^[A-Z]{3}$') NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.expense_splits'::regclass
      AND conname = 'expense_splits_amount_nonnegative'
  ) THEN
    ALTER TABLE public.expense_splits
      ADD CONSTRAINT expense_splits_amount_nonnegative CHECK (amount >= 0) NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_friend_requests_sender
  ON public.friend_requests(sender_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver
  ON public.friend_requests(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation
  ON public.direct_messages (
    LEAST(sender_id, receiver_id),
    GREATEST(sender_id, receiver_id),
    created_at DESC
  );
CREATE INDEX IF NOT EXISTS idx_direct_messages_receiver
  ON public.direct_messages(receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_expenses_trip_created
  ON public.group_expenses(trip_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_splits_expense
  ON public.expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_user_settled
  ON public.expense_splits(user_id, settled);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_group_expenses_updated_at ON public.group_expenses;
CREATE TRIGGER trg_group_expenses_updated_at
  BEFORE UPDATE ON public.group_expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "friend_requests_select" ON public.friend_requests;
CREATE POLICY "friend_requests_select" ON public.friend_requests
  FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());
DROP POLICY IF EXISTS "friend_requests_insert" ON public.friend_requests;
CREATE POLICY "friend_requests_insert" ON public.friend_requests
  FOR INSERT WITH CHECK (sender_id = auth.uid());
DROP POLICY IF EXISTS "friend_requests_update" ON public.friend_requests;
CREATE POLICY "friend_requests_update" ON public.friend_requests
  FOR UPDATE USING (receiver_id = auth.uid());
DROP POLICY IF EXISTS "friend_requests_delete" ON public.friend_requests;
CREATE POLICY "friend_requests_delete" ON public.friend_requests
  FOR DELETE USING (sender_id = auth.uid() OR receiver_id = auth.uid());

DROP POLICY IF EXISTS "direct_messages_select" ON public.direct_messages;
CREATE POLICY "direct_messages_select" ON public.direct_messages
  FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());
DROP POLICY IF EXISTS "direct_messages_insert" ON public.direct_messages;
CREATE POLICY "direct_messages_insert" ON public.direct_messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());
DROP POLICY IF EXISTS "direct_messages_update" ON public.direct_messages;
CREATE POLICY "direct_messages_update" ON public.direct_messages
  FOR UPDATE USING (receiver_id = auth.uid());
DROP POLICY IF EXISTS "direct_messages_delete" ON public.direct_messages;
CREATE POLICY "direct_messages_delete" ON public.direct_messages
  FOR DELETE USING (sender_id = auth.uid() OR receiver_id = auth.uid());

DROP POLICY IF EXISTS "group_expenses_select" ON public.group_expenses;
CREATE POLICY "group_expenses_select" ON public.group_expenses
  FOR SELECT USING (public.is_trip_member(trip_id));
DROP POLICY IF EXISTS "group_expenses_insert" ON public.group_expenses;
CREATE POLICY "group_expenses_insert" ON public.group_expenses
  FOR INSERT WITH CHECK (public.is_trip_member(trip_id) AND paid_by = auth.uid());
DROP POLICY IF EXISTS "group_expenses_update" ON public.group_expenses;
CREATE POLICY "group_expenses_update" ON public.group_expenses
  FOR UPDATE USING (paid_by = auth.uid());
DROP POLICY IF EXISTS "group_expenses_delete" ON public.group_expenses;
CREATE POLICY "group_expenses_delete" ON public.group_expenses
  FOR DELETE USING (paid_by = auth.uid());

DROP POLICY IF EXISTS "expense_splits_select" ON public.expense_splits;
CREATE POLICY "expense_splits_select" ON public.expense_splits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.group_expenses ge
      WHERE ge.id = expense_id AND public.is_trip_member(ge.trip_id)
    )
  );
DROP POLICY IF EXISTS "expense_splits_insert" ON public.expense_splits;
CREATE POLICY "expense_splits_insert" ON public.expense_splits
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_expenses ge
      WHERE ge.id = expense_id AND public.is_trip_member(ge.trip_id)
    )
  );
DROP POLICY IF EXISTS "expense_splits_update" ON public.expense_splits;
CREATE POLICY "expense_splits_update" ON public.expense_splits
  FOR UPDATE USING (user_id = auth.uid());
DROP POLICY IF EXISTS "expense_splits_delete" ON public.expense_splits;
CREATE POLICY "expense_splits_delete" ON public.expense_splits
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.group_expenses ge
      WHERE ge.id = expense_id AND ge.paid_by = auth.uid()
    )
  );

-- Enable live updates when the standard Supabase Realtime publication exists.
DO $$
DECLARE
  v_table TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_table IN ARRAY ARRAY[
      'direct_messages', 'friend_requests', 'group_expenses', 'expense_splits'
    ] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = v_table
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
      END IF;
    END LOOP;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- External API keys, rate limits, and booking request records
-- ---------------------------------------------------------------------------

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
  ON public.integration_api_keys(user_id, created_at DESC);
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
  INSERT INTO public.integration_api_rate_limits(api_key_id, window_start, request_count)
  VALUES (p_api_key_id, v_window, 1)
  ON CONFLICT (api_key_id, window_start)
  DO UPDATE SET request_count = public.integration_api_rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  IF random() < 0.01 THEN
    DELETE FROM public.integration_api_rate_limits
    WHERE window_start < now() - interval '2 days';
  END IF;

  RETURN QUERY
    SELECT v_count <= p_limit,
           greatest(0, p_limit - v_count),
           v_window + interval '1 minute';
END;
$$;
REVOKE ALL ON FUNCTION public.consume_integration_api_rate_limit(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_integration_api_rate_limit(UUID, INTEGER)
  TO service_role;

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
  ON public.travel_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_travel_orders_trip_created
  ON public.travel_orders(trip_id, created_at DESC);
ALTER TABLE public.travel_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.travel_orders FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.travel_orders TO service_role;

DROP TRIGGER IF EXISTS update_travel_orders_updated_at ON public.travel_orders;
CREATE TRIGGER update_travel_orders_updated_at
  BEFORE UPDATE ON public.travel_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;
