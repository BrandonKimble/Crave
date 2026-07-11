-- Reporter's "what's wrong" reason on photo reports (page-registry §8.6:
-- ellipsis → shared modal with reasons → report). Nullable — legacy rows
-- predate the field.
ALTER TABLE "photo_reports" ADD COLUMN "reason" VARCHAR(32);
