-- §9b UGC reports (Apple 1.2): comment reports + user reports. v1 records
-- only — no auto-hide threshold; moderation is human, these tables are the
-- review queue.

CREATE TABLE "poll_comment_reports" (
    "report_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "comment_id" UUID NOT NULL,
    "reporter_user_id" UUID NOT NULL,
    "reason" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_comment_reports_pkey" PRIMARY KEY ("report_id")
);

CREATE UNIQUE INDEX "poll_comment_reports_comment_reporter_key" ON "poll_comment_reports"("comment_id", "reporter_user_id");
CREATE INDEX "idx_poll_comment_reports_comment" ON "poll_comment_reports"("comment_id");

ALTER TABLE "poll_comment_reports" ADD CONSTRAINT "poll_comment_reports_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "poll_comments"("comment_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "poll_comment_reports" ADD CONSTRAINT "poll_comment_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "user_reports" (
    "report_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reporter_user_id" UUID NOT NULL,
    "reported_user_id" UUID NOT NULL,
    "reason" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_reports_pkey" PRIMARY KEY ("report_id")
);

CREATE UNIQUE INDEX "user_reports_reporter_reported_key" ON "user_reports"("reporter_user_id", "reported_user_id");
CREATE INDEX "idx_user_reports_reported" ON "user_reports"("reported_user_id");

ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
