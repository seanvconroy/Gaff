-- ADR-0017: the place index needs pg_trgm (a trusted extension). On Supabase, if the app's role
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
	"is_area" boolean NOT NULL,
	"search_text" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text,
	"version" integer NOT NULL,
	CONSTRAINT "places_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "places_search_trgm_idx" ON "places" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "places_search_prefix_idx" ON "places" USING btree ("search_text" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "places_area_idx" ON "places" USING btree ("is_area");--> statement-breakpoint
-- M56: the redesign's first, hand-made place list named six places differently from the index
-- (src/domain/search/place-slug.ts). A saved search of one keeps its place.
SELECT set_config('app.rls_bypass', 'on', true);--> statement-breakpoint
UPDATE "saved_searches" AS s
SET "filters" = jsonb_set(s."filters", '{where}', to_jsonb(m.new)),
    "search_key" = regexp_replace(s."search_key", '^where=' || m.old || '(&|$)', 'where=' || m.new || '\1')
FROM (VALUES
  ('bagenalstown', 'muine-bheag'),
  ('dingle', 'dingle-daingean-ui-chuis'),
  ('tubbercurry', 'tobercurry'),
  ('ballinlough', 'ballinlough-2'),
  ('irishtown', 'irishtown-2'),
  ('docklands', 'grand-canal-dock')
) AS m(old, new)
WHERE s."filters"->>'where' = m.old;--> statement-breakpoint
SELECT set_config('app.rls_bypass', 'off', true);