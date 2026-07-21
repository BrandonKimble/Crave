-- §14.5 durable window store: month/grant window consumption survives process
-- restarts. perMinute pools deliberately have no rows here (see schema note).
CREATE TABLE "pool_window_consumption" (
  "pool_name" VARCHAR(128) NOT NULL,
  "window_key" VARCHAR(32) NOT NULL,
  "consumed" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "granted" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "pool_window_consumption_pkey" PRIMARY KEY ("pool_name", "window_key")
);
