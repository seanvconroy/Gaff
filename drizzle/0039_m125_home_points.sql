CREATE TABLE "map_daily_counts" (
	"day" date NOT NULL,
	"event" text NOT NULL,
	"kind" text DEFAULT '' NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "map_daily_counts_day_event_kind_pk" PRIMARY KEY("day","event","kind")
);
--> statement-breakpoint
ALTER TABLE "map_daily_counts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "point_source" text;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "point_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lettings" ADD CONSTRAINT "lettings_point_whole" CHECK (("lettings"."latitude" is null) = ("lettings"."longitude" is null) and ("lettings"."latitude" is null) = ("lettings"."point_source" is null));--> statement-breakpoint
ALTER TABLE "lettings" ADD CONSTRAINT "lettings_point_in_ireland" CHECK ("lettings"."latitude" is null or ("lettings"."latitude" between 51.3 and 55.5 and "lettings"."longitude" between -10.7 and -5.3));--> statement-breakpoint
CREATE POLICY "map_daily_counts_system" ON "map_daily_counts" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.rls_bypass', true) = 'on') WITH CHECK (current_setting('app.rls_bypass', true) = 'on');