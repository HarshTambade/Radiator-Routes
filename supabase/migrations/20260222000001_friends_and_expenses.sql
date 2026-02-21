-- ============================================================
-- RADIATOR ROUTES — Migration: Friends, DMs & Group Expenses
-- ============================================================

-- ── friend_requests ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.friend_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sender_id, receiver_id)
);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

-- Users can see requests they sent or received
CREATE POLICY "friend_requests_select" ON public.friend_requests
  FOR SELECT USING (
    sender_id = auth.uid() OR receiver_id = auth.uid()
  );

-- Only the sender can create a request
CREATE POLICY "friend_requests_insert" ON public.friend_requests
  FOR INSERT WITH CHECK (sender_id = auth.uid());

-- Only the receiver can update (accept/reject) a request
CREATE POLICY "friend_requests_update" ON public.friend_requests
  FOR UPDATE USING (receiver_id = auth.uid());

-- Either party can delete
CREATE POLICY "friend_requests_delete" ON public.friend_requests
  FOR DELETE USING (
    sender_id = auth.uid() OR receiver_id = auth.uid()
  );

-- ── direct_messages ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content     text NOT NULL,
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- Users can see messages they sent or received
CREATE POLICY "direct_messages_select" ON public.direct_messages
  FOR SELECT USING (
    sender_id = auth.uid() OR receiver_id = auth.uid()
  );

-- Only the sender can insert
CREATE POLICY "direct_messages_insert" ON public.direct_messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());

-- Only the receiver can mark as read
CREATE POLICY "direct_messages_update" ON public.direct_messages
  FOR UPDATE USING (receiver_id = auth.uid());

-- Either party can delete their own messages
CREATE POLICY "direct_messages_delete" ON public.direct_messages
  FOR DELETE USING (
    sender_id = auth.uid() OR receiver_id = auth.uid()
  );

-- Index for fast conversation lookup
CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation
  ON public.direct_messages (
    LEAST(sender_id, receiver_id),
    GREATEST(sender_id, receiver_id),
    created_at
  );

-- ── group_expenses ────────────────────────────────────────────────────────────
-- Tracks shared expenses within a trip for bill-splitting
CREATE TABLE IF NOT EXISTS public.group_expenses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  paid_by      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text,
  amount       numeric(12, 2) NOT NULL DEFAULT 0,
  currency     text NOT NULL DEFAULT 'INR',
  category     text NOT NULL DEFAULT 'general'
                 CHECK (category IN ('accommodation','food','transport','activity','shopping','general','other')),
  split_type   text NOT NULL DEFAULT 'equal'
                 CHECK (split_type IN ('equal','custom','percentage')),
  split_with   uuid[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.group_expenses ENABLE ROW LEVEL SECURITY;

-- Trip members can view expenses
CREATE POLICY "group_expenses_select" ON public.group_expenses
  FOR SELECT USING (
    public.is_trip_member(trip_id)
  );

-- Trip members can add expenses
CREATE POLICY "group_expenses_insert" ON public.group_expenses
  FOR INSERT WITH CHECK (
    public.is_trip_member(trip_id) AND paid_by = auth.uid()
  );

-- Only the person who paid can update/delete
CREATE POLICY "group_expenses_update" ON public.group_expenses
  FOR UPDATE USING (paid_by = auth.uid());

CREATE POLICY "group_expenses_delete" ON public.group_expenses
  FOR DELETE USING (paid_by = auth.uid());

-- ── expense_splits ────────────────────────────────────────────────────────────
-- Individual share per member for an expense
CREATE TABLE IF NOT EXISTS public.expense_splits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id   uuid NOT NULL REFERENCES public.group_expenses(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount       numeric(12, 2) NOT NULL DEFAULT 0,
  percentage   numeric(5, 2),
  settled      boolean NOT NULL DEFAULT false,
  settled_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (expense_id, user_id)
);

ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;

-- Anyone involved in the expense can see splits
CREATE POLICY "expense_splits_select" ON public.expense_splits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.group_expenses ge
      WHERE ge.id = expense_id
        AND public.is_trip_member(ge.trip_id)
    )
  );

CREATE POLICY "expense_splits_insert" ON public.expense_splits
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_expenses ge
      WHERE ge.id = expense_id
        AND public.is_trip_member(ge.trip_id)
    )
  );

-- User can mark their own split as settled
CREATE POLICY "expense_splits_update" ON public.expense_splits
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "expense_splits_delete" ON public.expense_splits
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.group_expenses ge
      WHERE ge.id = expense_id AND ge.paid_by = auth.uid()
    )
  );

-- ── updated_at triggers ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_group_expenses_updated_at ON public.group_expenses;
CREATE TRIGGER trg_group_expenses_updated_at
  BEFORE UPDATE ON public.group_expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── realtime ──────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expense_splits;
