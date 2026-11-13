CREATE TABLE "map_daily_counts" (
	"day" date NOT NULL,
	"event" text NOT NULL,
	"kind" text DEFAULT '' NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "map_daily_counts_day_event_kind_pk" PRIMARY KEY("day","event","kind")
);
--> statement-breakpoint
ALTER TABLE "map_daily_counts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "developments" ADD COLUMN "point_source" text DEFAULT 'area' NOT NULL;--> statement-breakpoint
ALTER TABLE "developments" ADD COLUMN "point_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "homes" ADD COLUMN "point_source" text DEFAULT 'area' NOT NULL;--> statement-breakpoint
ALTER TABLE "homes" ADD COLUMN "point_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "public_listings" ADD COLUMN "on_map" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE POLICY "staff_zone" ON "map_daily_counts" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.role', true) = 'staff' or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (current_setting('app.role', true) = 'staff' or current_setting('app.rls_bypass', true) = 'on');