CREATE TABLE "developments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"address_line1" text NOT NULL,
	"area" text NOT NULL,
	"county" text NOT NULL,
	"eircode" text,
	"routing_key" text,
	"latitude" double precision,
	"longitude" double precision,
	"description" text,
	"amenities" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "developments_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "developments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "homes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"development_id" uuid,
	"unit_type_id" uuid,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"area" text NOT NULL,
	"county" text NOT NULL,
	"eircode" text,
	"routing_key" text,
	"latitude" double precision,
	"longitude" double precision,
	"show_exact_address" boolean DEFAULT true NOT NULL,
	"property_type" text NOT NULL,
	"bedrooms" integer NOT NULL,
	"bathrooms" integer NOT NULL,
	"ensuites" integer,
	"floor_area_sqm" integer,
	"floor" integer,
	"has_lift" boolean,
	"ber_scale" text,
	"ber_rating" text NOT NULL,
	"ber_number" text,
	"ber_certificate_date" date,
	"ber_exempt_reason" text,
	"heating" text,
	"parking" text,
	"outdoor_space" text,
	"accessibility" text[] DEFAULT '{}'::text[] NOT NULL,
	"appliances" text[] DEFAULT '{}'::text[] NOT NULL,
	"broadband" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "homes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "unit_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"development_id" uuid NOT NULL,
	"label" text NOT NULL,
	"property_type" text NOT NULL,
	"bedrooms" integer NOT NULL,
	"bathrooms" integer NOT NULL,
	"min_floor_area_sqm" integer,
	"max_floor_area_sqm" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "unit_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "listing_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"content" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_revisions_listing_revision" UNIQUE("listing_id","revision")
);
--> statement-breakpoint
ALTER TABLE "listing_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"letting_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"slug" text,
	"description" text,
	"description_source" text,
	"assigned_to" text,
	"published_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"pause_reason" text,
	"closed_at" timestamp with time zone,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listings_lettingId_unique" UNIQUE("letting_id"),
	CONSTRAINT "listings_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "listings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "public_listings" (
	"listing_id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"status" text NOT NULL,
	"title" text NOT NULL,
	"address_shown" text NOT NULL,
	"area" text NOT NULL,
	"county" text NOT NULL,
	"routing_key" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"rent_cents" integer NOT NULL,
	"deposit_cents" integer NOT NULL,
	"property_type" text NOT NULL,
	"bedrooms" integer NOT NULL,
	"bathrooms" integer NOT NULL,
	"furnished" text NOT NULL,
	"available_from" date NOT NULL,
	"ber_label" text NOT NULL,
	"ber_band" text,
	"pets_considered" boolean NOT NULL,
	"facts" jsonb NOT NULL,
	"criteria" jsonb NOT NULL,
	"photos" jsonb NOT NULL,
	"letter" jsonb NOT NULL,
	"development_id" uuid,
	"published_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	"enquiries_close_at" timestamp with time zone,
	"completeness" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_listings_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "public_listings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "renter_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"given_name" text NOT NULL,
	"family_name" text,
	"mobile" text,
	"mobile_confirmed_at" timestamp with time zone,
	"keep_details" boolean DEFAULT false NOT NULL,
	"keep_consent_at" timestamp with time zone,
	"keep_consent_version" text,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "renter_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- ADR-0018: every existing letting gets its own home, then a draft listing. The tables are
-- already forced under row-level security, so the backfill runs with the bypass switch.
SELECT set_config('app.rls_bypass', 'on', true);--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "home_id" uuid;--> statement-breakpoint
UPDATE "lettings" SET "home_id" = gen_random_uuid();--> statement-breakpoint
INSERT INTO "homes" ("id", "organisation_id", "address_line1", "address_line2", "area", "county", "eircode", "routing_key", "property_type", "bedrooms", "bathrooms", "ber_scale", "ber_rating", "ber_exempt_reason", "parking", "created_by", "created_at", "updated_at")
SELECT "home_id", "organisation_id", "address_line1", "address_line2", "area", "county", "eircode", left("eircode", 3), "property_type", "bedrooms", "bathrooms",
  CASE WHEN "ber_rating" = 'exempt' THEN NULL ELSE 'previous' END, "ber_rating",
  CASE WHEN "ber_rating" = 'exempt' THEN 'other' ELSE NULL END, "parking", "created_by", "created_at", now()
FROM "lettings";--> statement-breakpoint
ALTER TABLE "lettings" ALTER COLUMN "home_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "deposit_cents" integer;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "enquiry_limit" integer;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "enquiries_close_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "developments" ADD CONSTRAINT "developments_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developments" ADD CONSTRAINT "developments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homes" ADD CONSTRAINT "homes_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homes" ADD CONSTRAINT "homes_development_id_developments_id_fk" FOREIGN KEY ("development_id") REFERENCES "public"."developments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homes" ADD CONSTRAINT "homes_unit_type_id_unit_types_id_fk" FOREIGN KEY ("unit_type_id") REFERENCES "public"."unit_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homes" ADD CONSTRAINT "homes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_types" ADD CONSTRAINT "unit_types_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_types" ADD CONSTRAINT "unit_types_development_id_developments_id_fk" FOREIGN KEY ("development_id") REFERENCES "public"."developments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_revisions" ADD CONSTRAINT "listing_revisions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_revisions" ADD CONSTRAINT "listing_revisions_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_revisions" ADD CONSTRAINT "listing_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_letting_id_lettings_id_fk" FOREIGN KEY ("letting_id") REFERENCES "public"."lettings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_listings" ADD CONSTRAINT "public_listings_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_listings" ADD CONSTRAINT "public_listings_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_listings" ADD CONSTRAINT "public_listings_development_id_developments_id_fk" FOREIGN KEY ("development_id") REFERENCES "public"."developments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renter_profiles" ADD CONSTRAINT "renter_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "developments_organisation_idx" ON "developments" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "homes_organisation_idx" ON "homes" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "homes_development_idx" ON "homes" USING btree ("development_id");--> statement-breakpoint
CREATE INDEX "unit_types_development_idx" ON "unit_types" USING btree ("development_id");--> statement-breakpoint
CREATE INDEX "listings_organisation_idx" ON "listings" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "public_listings_search_idx" ON "public_listings" USING btree ("status","county","rent_cents");--> statement-breakpoint
CREATE INDEX "public_listings_location_idx" ON "public_listings" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "public_listings_routing_key_idx" ON "public_listings" USING btree ("routing_key");--> statement-breakpoint
ALTER TABLE "lettings" ADD CONSTRAINT "lettings_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "developments" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "homes" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "unit_types" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "listing_revisions" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "listings" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "public_listings" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "public_read" ON "public_listings" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "renter_isolation" ON "renter_profiles" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.user_id', true), '') or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '') or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
INSERT INTO "listings" ("organisation_id", "letting_id", "home_id", "status", "created_by", "created_at", "updated_at")
SELECT "organisation_id", "id", "home_id", CASE WHEN "status" IN ('let', 'withdrawn') THEN 'withdrawn' ELSE 'draft' END, "created_by", "created_at", now()
FROM "lettings";--> statement-breakpoint
SELECT set_config('app.rls_bypass', 'off', true);
