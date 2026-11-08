-- ADR-0027: the place index needs pg_trgm (a trusted extension). On Supabase, if the app's role
-- can't create it, enable pg_trgm once in the dashboard (Database, Extensions) and deploy again.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION 'pg_trgm is missing: enable it in Supabase (Database, Extensions), then deploy again';
END $$;--> statement-breakpoint
CREATE TYPE "public"."landmark_kind" AS ENUM('college', 'hospital', 'station', 'park', 'shopping_centre');--> statement-breakpoint
CREATE TYPE "public"."place_kind" AS ENUM('county', 'city', 'town', 'village', 'district', 'area', 'townland', 'street', 'landmark');--> statement-breakpoint
CREATE TABLE "place_misses" (
	"day" date NOT NULL,
	"text" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "place_misses_day_text_pk" PRIMARY KEY("day","text")
);
--> statement-breakpoint
ALTER TABLE "place_misses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"kind" "place_kind" NOT NULL,
	"landmark_kind" "landmark_kind",
	"name" text NOT NULL,
	"irish_name" text,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"context" text,
	"county" text NOT NULL,
	"routing_key" text,
	"centre_lat" double precision NOT NULL,
	"centre_lng" double precision NOT NULL,
	"min_lat" double precision,
	"min_lng" double precision,
	"max_lat" double precision,
	"max_lng" double precision,
	"line" jsonb,
	"radius_metres" integer NOT NULL,
	"population" integer,
	"live_homes" integer DEFAULT 0 NOT NULL,
	"has_page" boolean NOT NULL,
	"search_text" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text,
	"version" integer NOT NULL,
	CONSTRAINT "places_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "places" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recent_searches" (
	"user_id" text NOT NULL,
	"area_path" text NOT NULL,
	"query" text DEFAULT '' NOT NULL,
	"label" text NOT NULL,
	"searched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recent_searches_user_id_area_path_query_pk" PRIMARY KEY("user_id","area_path","query")
);
--> statement-breakpoint
ALTER TABLE "recent_searches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recent_searches" ADD CONSTRAINT "recent_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "places_search_trgm_idx" ON "places" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "places_search_prefix_idx" ON "places" USING btree ("search_text" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "places_page_idx" ON "places" USING btree ("has_page");--> statement-breakpoint
CREATE INDEX "recent_searches_user_idx" ON "recent_searches" USING btree ("user_id","searched_at");--> statement-breakpoint
CREATE POLICY "staff_zone" ON "place_misses" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.role', true) = 'staff' or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (current_setting('app.role', true) = 'staff' or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "public_read" ON "places" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "system_write" ON "places" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.rls_bypass', true) = 'on') WITH CHECK (current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "renter_isolation" ON "recent_searches" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.user_id', true), '') or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '') or current_setting('app.rls_bypass', true) = 'on');