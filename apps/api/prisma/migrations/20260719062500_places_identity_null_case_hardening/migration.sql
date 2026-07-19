-- Red-team d2da636d findings 1a/1b: the identity index must treat NULL
-- subdivision codes as EQUAL (country-level nodes fork otherwise — Postgres
-- default is NULLs-distinct) and must compare names CASE-INSENSITIVELY to
-- match the application's identity law (§1: case is display, not identity).
-- Expression indexes are outside Prisma's schema language, so this lives in
-- raw SQL and schema.prisma carries a documenting comment instead of @@unique.
DROP INDEX IF EXISTS "uq_places_identity";
CREATE UNIQUE INDEX "uq_places_identity" ON "places"("country_code", "subdivision_code", "provider_level_code", lower("name")) NULLS NOT DISTINCT;
