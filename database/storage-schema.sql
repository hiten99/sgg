-- ============================================================
-- STORAGE & CAROUSEL SCHEMA
-- Run this entire file in your Supabase SQL Editor
-- ============================================================

-- ── 1. Create Storage Bucket ───────────────────────────────────────────────────
-- Creates a publicly accessible bucket named "public-images"
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'public-images',
  'public-images',
  true,
  5242880, -- 5MB limit
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ── 2. Storage Security Policies ───────────────────────────────────────────────
-- Allow public access to view/download images
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'public-images' );

-- Allow authenticated admins to upload images
CREATE POLICY "Admin Upload Access"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'public-images' AND is_admin() );

-- Allow authenticated admins to update images
CREATE POLICY "Admin Update Access"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'public-images' AND is_admin() );

-- Allow authenticated admins to delete images
CREATE POLICY "Admin Delete Access"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'public-images' AND is_admin() );

-- ── 3. Carousel Images Table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hero_carousel (
    id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    image_url   text        NOT NULL,
    alt_text    text        DEFAULT 'SGG Community',
    sort_order  integer     DEFAULT 0,
    created_at  timestamptz DEFAULT now()
);

-- Fast sort for public queries
CREATE INDEX IF NOT EXISTS idx_hero_carousel_order ON public.hero_carousel (sort_order ASC);

-- RLS
ALTER TABLE public.hero_carousel ENABLE ROW LEVEL SECURITY;

GRANT USAGE  ON SCHEMA public       TO anon, authenticated;
GRANT SELECT ON public.hero_carousel TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.hero_carousel TO authenticated;

-- Public can read
CREATE POLICY "Anyone can view carousel images"
ON public.hero_carousel FOR SELECT USING (true);

-- Admins can manage
CREATE POLICY "Admins can manage carousel images"
ON public.hero_carousel FOR ALL
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());
