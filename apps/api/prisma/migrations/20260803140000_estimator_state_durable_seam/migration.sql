-- D41: the estimator registry's durable side. Additive only.
CREATE TABLE "estimator_state" (
    "estimator_name" VARCHAR(128) NOT NULL,
    "subject_key" VARCHAR(255) NOT NULL,
    "weighted_sum" DOUBLE PRECISION NOT NULL,
    "weight_total" DOUBLE PRECISION NOT NULL,
    "weight_squares" DOUBLE PRECISION NOT NULL,
    "sum_of_squares" DOUBLE PRECISION NOT NULL,
    "last_observed_at" TIMESTAMPTZ(6),
    "last_decayed_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "estimator_state_pkey" PRIMARY KEY ("estimator_name","subject_key")
);
