-- ============================================================================
-- Activities: concurrency stamp + opening hours
-- ============================================================================
-- Two columns, both on public.activities, both prerequisites for patches that
-- could not be implemented without them.
--
-- 1. updated_at  (backlog P1 — conflict handling)
--    The offline mutation queue replayed queued edits with last-write-wins
--    semantics. Correct for one person editing their own trip; wrong for two
--    members editing the same activity, where the later replay silently
--    overwrote the earlier one with no record that anything was lost.
--    A replayed update now carries the updated_at value the client last saw and
--    matches on it, so a row someone else has since changed rejects the stale
--    write instead of clobbering it. activities was the one collaborative table
--    without this column, which is exactly where the conflict lives.
--
-- 2. opening_hours  (backlog P5 — the missing verifier constraint)
--    lib/itineraryVerifier.ts could not catch a Wednesday-only market booked on
--    a Sunday, because no POI hours data was stored anywhere. JSONB rather than
--    text so both a structured shape and a raw OSM opening_hours string can be
--    held; the verifier accepts either.
--
-- Idempotent: safe to re-run, in line with every other migration here.
-- ============================================================================

-- ── 1. updated_at ───────────────────────────────────────────────────────────

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill so existing rows carry a usable precondition value rather than a
-- NULL that would make every queued update look like a conflict.
UPDATE public.activities
   SET updated_at = COALESCE(updated_at, created_at, now())
 WHERE updated_at IS NULL;

-- Reuse the shared stamping trigger already defined for profiles, trips,
-- itineraries and communities.
DROP TRIGGER IF EXISTS update_activities_updated_at ON public.activities;
CREATE TRIGGER update_activities_updated_at
  BEFORE UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- The precondition filter is `WHERE id = $1 AND updated_at = $2`, so the
-- primary key already carries the lookup. No extra index needed.

-- ── 2. opening_hours ────────────────────────────────────────────────────────

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS opening_hours JSONB;

COMMENT ON COLUMN public.activities.opening_hours IS
  'Opening hours for the underlying POI, consumed by lib/itineraryVerifier.ts. '
  'Either a structured object {"days":{"mon":[["09:00","17:00"]]},'
  '"closed_dates":["2026-12-25"]} or {"osm":"We 06:00-14:00"} holding a raw '
  'OSM opening_hours string. NULL means unknown, which the verifier treats as '
  'unverifiable rather than as closed. When "days" is present, a weekday absent '
  'from it is closed — matching OSM semantics.';

-- ============================================================================
-- Verification
-- ============================================================================
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'activities'
--      AND column_name IN ('updated_at', 'opening_hours');
--
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.activities'::regclass AND NOT tgisinternal;
-- ============================================================================
