ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('event-images', 'event-images', true, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 8388608,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

DROP POLICY IF EXISTS "Allow public read event-images" ON storage.objects;
CREATE POLICY "Allow public read event-images" ON storage.objects FOR SELECT
USING (bucket_id = 'event-images');

DROP POLICY IF EXISTS "Allow admin upload event-images" ON storage.objects;
CREATE POLICY "Allow admin upload event-images" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'event-images');
