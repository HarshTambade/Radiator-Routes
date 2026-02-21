-- ============================================================
-- RADIATOR ROUTES — Migration: Fix trip_join_requests status CHECK constraint
-- ============================================================
-- The UI was sending status = 'accepted' but the DB constraint only allows
-- ('pending', 'approved', 'rejected'). This migration:
--   1. Drops the old constraint if it exists (any name variant)
--   2. Updates any existing 'accepted' rows to 'approved'
--   3. Re-creates a clean, named CHECK constraint
-- ============================================================

-- Step 1: Drop old constraint variants (safe — IF EXISTS)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM   information_schema.table_constraints
    WHERE  table_schema    = 'public'
    AND    table_name      = 'trip_join_requests'
    AND    constraint_name = 'trip_join_requests_status_check'
  ) THEN
    ALTER TABLE public.trip_join_requests
      DROP CONSTRAINT trip_join_requests_status_check;
  END IF;
END $$;

-- Also drop alternate name variants that may exist from older migrations
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM   information_schema.table_constraints
    WHERE  table_schema    = 'public'
    AND    table_name      = 'trip_join_requests'
    AND    constraint_name = 'trip_join_requests_status_fkey'
  ) THEN
    ALTER TABLE public.trip_join_requests
      DROP CONSTRAINT trip_join_requests_status_fkey;
  END IF;
END $$;

-- Step 2: Migrate any legacy 'accepted' values → 'approved'
UPDATE public.trip_join_requests
SET    status = 'approved'
WHERE  status = 'accepted';

-- Step 3: Re-create the constraint with the correct allowed values
--         Allowed: 'pending' | 'approved' | 'rejected'
ALTER TABLE public.trip_join_requests
  ADD CONSTRAINT trip_join_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- Step 4: Ensure resolved_at column exists (older migrations may not have it)
ALTER TABLE public.trip_join_requests
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Step 5: Ensure invite_id column exists for FK from trip_invites
ALTER TABLE public.trip_join_requests
  ADD COLUMN IF NOT EXISTS invite_id UUID
    REFERENCES public.trip_invites(id) ON DELETE SET NULL;

-- Step 6: Re-create RLS policies (idempotent)
ALTER TABLE public.trip_join_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own requests"    ON public.trip_join_requests;
DROP POLICY IF EXISTS "Users can create join requests" ON public.trip_join_requests;
DROP POLICY IF EXISTS "Organizer can update requests"  ON public.trip_join_requests;
DROP POLICY IF EXISTS "Users can delete own requests"  ON public.trip_join_requests;

-- Any authenticated user can read their own requests;
-- trip members / organizers can see all requests for their trips
CREATE POLICY "Users can view own requests"
  ON public.trip_join_requests FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.is_trip_member(trip_id)
  );

-- Any authenticated user can submit a join request for themselves
CREATE POLICY "Users can create join requests"
  ON public.trip_join_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Only the trip organizer can approve / reject requests
CREATE POLICY "Organizer can update requests"
  ON public.trip_join_requests FOR UPDATE
  USING (public.is_trip_organizer(trip_id));

-- Users can withdraw their own pending requests
CREATE POLICY "Users can delete own requests"
  ON public.trip_join_requests FOR DELETE
  USING (auth.uid() = user_id);

-- Step 7: Ensure realtime is enabled for this table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_publication_tables
    WHERE  pubname    = 'supabase_realtime'
    AND    schemaname = 'public'
    AND    tablename  = 'trip_join_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_join_requests;
  END IF;
END $$;

-- ============================================================
-- Summary of allowed status values after this migration:
--   'pending'  — request submitted, awaiting organizer decision
--   'approved' — organizer accepted the request (member added)
--   'rejected' — organizer declined the request
-- ============================================================
