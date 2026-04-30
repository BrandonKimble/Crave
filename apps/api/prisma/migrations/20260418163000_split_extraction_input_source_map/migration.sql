ALTER TABLE "collection_extraction_inputs"
ADD COLUMN "source_map" JSONB;

UPDATE "collection_extraction_inputs"
SET "source_map" = "input_payload"->'source_map'
WHERE "input_payload" ? 'source_map';

UPDATE "collection_extraction_inputs"
SET "input_payload" = "input_payload" - 'source_map'
WHERE "input_payload" ? 'source_map';
