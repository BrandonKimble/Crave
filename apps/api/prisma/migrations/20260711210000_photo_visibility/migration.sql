-- Uploader-chosen audience (product/images.md / page-registry §7.4):
-- private photos surface ONLY to the uploader (own food log / own reads);
-- every public read path excludes them. Legacy rows are public.
CREATE TYPE "PhotoVisibility" AS ENUM ('public', 'private');
ALTER TABLE "photos" ADD COLUMN "visibility" "PhotoVisibility" NOT NULL DEFAULT 'public';
