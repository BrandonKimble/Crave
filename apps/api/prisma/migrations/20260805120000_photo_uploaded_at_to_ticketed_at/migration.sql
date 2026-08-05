-- F623: photos.uploaded_at is stamped at upload-TICKET MINT (createUploadTicket),
-- not at actual upload completion -- Cloudinary never reports a completion
-- timestamp we persist. reconcilePending reads this column for both the
-- grace window and the abandoned-after-an-hour expiry, so the name must say
-- what it is. Pure rename -- no data movement, indexes carry the rename
-- automatically (they reference the column, not a name literal).
ALTER TABLE "photos" RENAME COLUMN "uploaded_at" TO "ticketed_at";
