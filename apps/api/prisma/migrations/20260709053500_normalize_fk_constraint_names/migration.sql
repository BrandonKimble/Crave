-- Normalize two FK constraints to Prisma's naming + referential-action
-- conventions (they predate convention; the name/ON UPDATE mismatch made
-- every `migrate dev` diff noisy).
ALTER TABLE "access_grants" DROP CONSTRAINT IF EXISTS "access_grants_user_fkey";
ALTER TABLE "llm_batch_job_items" DROP CONSTRAINT IF EXISTS "llm_batch_job_items_job_fkey";
ALTER TABLE "llm_batch_job_items" DROP CONSTRAINT IF EXISTS "llm_batch_job_items_job_id_fkey";
ALTER TABLE "access_grants" DROP CONSTRAINT IF EXISTS "access_grants_user_id_fkey";
ALTER TABLE "llm_batch_job_items" ADD CONSTRAINT "llm_batch_job_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "llm_batch_jobs"("job_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
