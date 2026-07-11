-- Red-team (photos/mentions): the restaurant-mentions endpoint filters
-- poll_comments by JSONB containment on entity_spans; with no index every
-- request seq-scans the table. jsonb_path_ops GIN serves the @> operator.
CREATE INDEX "idx_poll_comments_entity_spans_gin" ON "poll_comments" USING GIN ("entity_spans" jsonb_path_ops);
