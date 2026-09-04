
-- =============================================
-- Atlas AI - Core Database Schema
-- =============================================

-- 1. Profiles table (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  phone_number TEXT,
  avatar_url TEXT,
  travel_personality JSONB DEFAULT '{}',
  travel_history JSONB DEFAULT '[]',
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Trips table
CREATE TABLE public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  destination TEXT NOT NULL,
  country TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  organizer_id UUID NOT NULL REFERENCES auth.users(id),
  budget_total DECIMAL(12, 2) DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'booked', 'ongoing', 'completed')),
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_trips_updated_at
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Trip memberships (for group travel)
CREATE TABLE public.trip_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('organizer', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(trip_id, user_id)
);

ALTER TABLE public.trip_memberships ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user is trip member
CREATE OR REPLACE FUNCTION public.is_trip_member(p_trip_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.trip_memberships
    WHERE trip_id = p_trip_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Helper function: check if user is trip organizer
CREATE OR REPLACE FUNCTION public.is_trip_organizer(p_trip_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.trips
    WHERE id = p_trip_id AND organizer_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Trip RLS policies
CREATE POLICY "Members can view trips" ON public.trips FOR SELECT USING (public.is_trip_member(id));
CREATE POLICY "Auth users can create trips" ON public.trips FOR INSERT WITH CHECK (auth.uid() = organizer_id);
CREATE POLICY "Organizer can update trips" ON public.trips FOR UPDATE USING (public.is_trip_organizer(id));
CREATE POLICY "Organizer can delete trips" ON public.trips FOR DELETE USING (public.is_trip_organizer(id));

-- Trip membership RLS
CREATE POLICY "Members can view memberships" ON public.trip_memberships FOR SELECT USING (public.is_trip_member(trip_id));
CREATE POLICY "Organizer can add members" ON public.trip_memberships FOR INSERT WITH CHECK (public.is_trip_organizer(trip_id));
CREATE POLICY "Organizer can remove members" ON public.trip_memberships FOR DELETE USING (public.is_trip_organizer(trip_id));

-- Auto-add organizer as member on trip creation
CREATE OR REPLACE FUNCTION public.auto_add_organizer_membership()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.trip_memberships (trip_id, user_id, role)
  VALUES (NEW.id, NEW.organizer_id, 'organizer');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_trip_created
  AFTER INSERT ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.auto_add_organizer_membership();

-- 4. Itineraries table
CREATE TABLE public.itineraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  version INT DEFAULT 1,
  variant_id TEXT,
  regret_score DECIMAL(5, 3),
  cost_breakdown JSONB DEFAULT '{}',
  is_published BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_itineraries_updated_at
  BEFORE UPDATE ON public.itineraries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Members can view itineraries" ON public.itineraries FOR SELECT USING (public.is_trip_member(trip_id));
CREATE POLICY "Members can create itineraries" ON public.itineraries FOR INSERT WITH CHECK (public.is_trip_member(trip_id));
CREATE POLICY "Members can update itineraries" ON public.itineraries FOR UPDATE USING (public.is_trip_member(trip_id));
CREATE POLICY "Members can delete itineraries" ON public.itineraries FOR DELETE USING (public.is_trip_member(trip_id));

-- 5. Activities table
CREATE TABLE public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id UUID NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  location_name TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  category TEXT CHECK (category IN ('food', 'attraction', 'transport', 'shopping', 'accommodation', 'other')),
  cost DECIMAL(10, 2) DEFAULT 0,
  estimated_steps INT,
  review_score DECIMAL(2, 1),
  priority FLOAT DEFAULT 0.5,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- Helper to get trip_id from activity
CREATE OR REPLACE FUNCTION public.get_trip_id_from_activity(p_itinerary_id UUID)
RETURNS UUID AS $$
  SELECT trip_id FROM public.itineraries WHERE id = p_itinerary_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE POLICY "Members can view activities" ON public.activities FOR SELECT USING (public.is_trip_member(public.get_trip_id_from_activity(itinerary_id)));
CREATE POLICY "Members can create activities" ON public.activities FOR INSERT WITH CHECK (public.is_trip_member(public.get_trip_id_from_activity(itinerary_id)));
CREATE POLICY "Members can update activities" ON public.activities FOR UPDATE USING (public.is_trip_member(public.get_trip_id_from_activity(itinerary_id)));
CREATE POLICY "Members can delete activities" ON public.activities FOR DELETE USING (public.is_trip_member(public.get_trip_id_from_activity(itinerary_id)));

-- 6. Messages table (realtime group chat)
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'suggestion', 'edit_request', 'system')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view messages" ON public.messages FOR SELECT USING (public.is_trip_member(trip_id));
CREATE POLICY "Members can send messages" ON public.messages FOR INSERT WITH CHECK (public.is_trip_member(trip_id) AND auth.uid() = sender_id);

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- 7. Disruption events
CREATE TABLE public.disruption_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  description TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved BOOLEAN DEFAULT FALSE,
  replan_applied BOOLEAN DEFAULT FALSE,
  old_itinerary JSONB,
  new_itinerary JSONB
);

ALTER TABLE public.disruption_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view disruption events" ON public.disruption_events FOR SELECT USING (public.is_trip_member(trip_id));

-- 8. Indexes for performance
CREATE INDEX idx_trips_organizer ON public.trips(organizer_id);
CREATE INDEX idx_trip_memberships_user ON public.trip_memberships(user_id);
CREATE INDEX idx_trip_memberships_trip ON public.trip_memberships(trip_id);
CREATE INDEX idx_itineraries_trip ON public.itineraries(trip_id);
CREATE INDEX idx_activities_itinerary ON public.activities(itinerary_id);
CREATE INDEX idx_activities_start_time ON public.activities(start_time);
CREATE INDEX idx_messages_trip_created ON public.messages(trip_id, created_at DESC);
CREATE INDEX idx_disruption_events_trip ON public.disruption_events(trip_id);
