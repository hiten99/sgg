-- ============================================================
-- EVENT MANAGEMENT SCHEMA
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- ── 1. Events table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.events (
    id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    title        text        NOT NULL,
    description  text,
    event_date   timestamptz NOT NULL,
    location     text,
    image_url    text,                                   -- future: event banner image
    category     text        DEFAULT 'general',          -- future: filter by category
    status       text        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'cancelled', 'draft')),
    created_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at   timestamptz DEFAULT now(),
    updated_at   timestamptz DEFAULT now()
);

-- ── 2. Indexes for performance at scale ────────────────────────────────────────
-- Fast sort/filter by date (most common query)
CREATE INDEX IF NOT EXISTS idx_events_event_date  ON public.events (event_date DESC);
-- Filter by status (active events only)
CREATE INDEX IF NOT EXISTS idx_events_status      ON public.events (status);
-- Filter by category (future)
CREATE INDEX IF NOT EXISTS idx_events_category    ON public.events (category);
-- Full-text search on title + description (future search bar)
CREATE INDEX IF NOT EXISTS idx_events_fts
    ON public.events USING gin(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'')));

-- ── 3. Auto-update updated_at on every UPDATE ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_touch_updated ON public.events;
CREATE TRIGGER events_touch_updated
    BEFORE UPDATE ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── 4. RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

GRANT USAGE  ON SCHEMA public       TO anon, authenticated;
GRANT SELECT ON public.events       TO anon, authenticated;  -- everyone can read
GRANT INSERT, UPDATE, DELETE ON public.events TO authenticated; -- filtered by RLS below

-- Anyone (including logged-out visitors) can read active events
CREATE POLICY "Anyone can view active events"
ON public.events FOR SELECT
USING (status != 'draft');                -- drafts hidden from non-admins

-- Only admins can insert
CREATE POLICY "Admins can create events"
ON public.events FOR INSERT
TO authenticated
WITH CHECK (is_admin());

-- Only admins can update
CREATE POLICY "Admins can update events"
ON public.events FOR UPDATE
TO authenticated
USING (is_admin());

-- Only admins can delete
CREATE POLICY "Admins can delete events"
ON public.events FOR DELETE
TO authenticated
USING (is_admin());

-- ── 5. Future tables (create now, populate later) ──────────────────────────────

-- RSVPs: tracks who is attending which event
CREATE TABLE IF NOT EXISTS public.event_rsvps (
    id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id   uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    user_id    uuid        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
    status     text        NOT NULL DEFAULT 'going'
                           CHECK (status IN ('going', 'maybe', 'not_going')),
    created_at timestamptz DEFAULT now(),
    UNIQUE (event_id, user_id)            -- one RSVP per user per event
);

CREATE INDEX IF NOT EXISTS idx_rsvps_event ON public.event_rsvps (event_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_user  ON public.event_rsvps (user_id);

ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.event_rsvps TO authenticated;

CREATE POLICY "Users can view RSVPs for active events"
ON public.event_rsvps FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can manage own RSVP"
ON public.event_rsvps FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Video recordings linked to events
CREATE TABLE IF NOT EXISTS public.event_videos (
    id          uuid  DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id    uuid  NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    title       text,
    video_url   text  NOT NULL,
    thumbnail   text,
    added_by    uuid  REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_videos_event ON public.event_videos (event_id);

ALTER TABLE public.event_videos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.event_videos TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.event_videos TO authenticated;

CREATE POLICY "Anyone can view videos" ON public.event_videos FOR SELECT USING (true);
CREATE POLICY "Admins can manage videos" ON public.event_videos
    FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
