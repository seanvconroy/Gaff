CREATE TABLE "listing_daily_stats" (
	"organisation_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"day" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"visitors" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "listing_daily_stats_listing_id_day_pk" PRIMARY KEY("listing_id","day")
);
--> statement-breakpoint
ALTER TABLE "listing_daily_stats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "listing_visitors" (
	"organisation_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"day" date NOT NULL,
	"visitor_hash" text NOT NULL,
	CONSTRAINT "listing_visitors_listing_id_day_visitor_hash_pk" PRIMARY KEY("listing_id","day","visitor_hash")
);
--> statement-breakpoint
ALTER TABLE "listing_visitors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public_listings" ADD COLUMN "viewings" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "public_listings" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listing_daily_stats" ADD CONSTRAINT "listing_daily_stats_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_daily_stats" ADD CONSTRAINT "listing_daily_stats_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_visitors" ADD CONSTRAINT "listing_visitors_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_visitors" ADD CONSTRAINT "listing_visitors_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "public_listings_live_idx" ON "public_listings" USING btree ("county","rent_cents") WHERE status = 'live';--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "listing_daily_stats" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "listing_visitors" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
SELECT set_config('app.rls_bypass', 'on', true);--> statement-breakpoint
UPDATE "public_listings" SET "closed_at" = "listings"."closed_at" FROM "listings" WHERE "listings"."id" = "public_listings"."listing_id" AND "public_listings"."status" IN ('let', 'withdrawn');--> statement-breakpoint
SELECT set_config('app.rls_bypass', 'off', true);
