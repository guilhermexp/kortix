-- Add preview column to canvases table for storing SVG thumbnails
ALTER TABLE canvases ADD COLUMN IF NOT EXISTS preview TEXT;

-- Add comment for documentation
COMMENT ON COLUMN canvases.preview IS 'SVG preview thumbnail as base64 data URL';
