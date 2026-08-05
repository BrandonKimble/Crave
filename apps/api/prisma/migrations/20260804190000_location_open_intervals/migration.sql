-- B1 (round-5 ideal): openness becomes SQL-evaluable. Derived from
-- core_restaurant_locations.hours via the SAME exported JS chain the
-- executor evaluates today (buildOperatingMetadataFromLocation →
-- buildStructuredWeeklyHours), midnight-crossing split into two rows.
-- dow: 0=Sunday..6=Saturday (matches EXTRACT(dow)). Minutes are local.
CREATE TABLE "derived_location_open_intervals" (
    "location_id" UUID NOT NULL,
    "dow" SMALLINT NOT NULL,
    "start_min" SMALLINT NOT NULL,
    "end_min" SMALLINT NOT NULL,

    CONSTRAINT "derived_location_open_intervals_pkey" PRIMARY KEY ("location_id", "dow", "start_min")
);

CREATE INDEX "idx_location_open_intervals_loc" ON "derived_location_open_intervals"("location_id");
