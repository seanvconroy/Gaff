CREATE TYPE "public"."letting_stage" AS ENUM('setup', 'enquiries', 'shortlist', 'viewings', 'applications', 'checks', 'offer', 'tenancy', 'close');--> statement-breakpoint
CREATE TYPE "public"."letting_status" AS ENUM('draft', 'live', 'let', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."viewing_kind" AS ENUM('slots', 'group');--> statement-breakpoint
CREATE TABLE "landlords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "landlords" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "letting_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"letting_id" uuid NOT NULL,
	"question" text,
	"answer" text NOT NULL,
	"source" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "letting_facts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lettings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"landlord_id" uuid,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"area" text NOT NULL,
	"county" text NOT NULL,
	"eircode" text,
	"monthly_rent_cents" integer NOT NULL,
	"available_from" date NOT NULL,
	"property_type" text NOT NULL,
	"bedrooms" integer NOT NULL,
	"bathrooms" integer NOT NULL,
	"furnished" text NOT NULL,
	"ber_rating" text NOT NULL,
	"parking" text,
	"photos_url" text,
	"daft_url" text,
	"myhome_url" text,
	"stage" "letting_stage" DEFAULT 'setup' NOT NULL,
	"status" "letting_status" DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"live_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lettings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "viewing_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"letting_id" uuid NOT NULL,
	"kind" "viewing_kind" NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"slot_minutes" integer,
	"capacity" integer,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "viewing_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "viewing_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"letting_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "viewing_slots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "landlords" ADD CONSTRAINT "landlords_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letting_facts" ADD CONSTRAINT "letting_facts_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letting_facts" ADD CONSTRAINT "letting_facts_letting_id_lettings_id_fk" FOREIGN KEY ("letting_id") REFERENCES "public"."lettings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letting_facts" ADD CONSTRAINT "letting_facts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lettings" ADD CONSTRAINT "lettings_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lettings" ADD CONSTRAINT "lettings_landlord_id_landlords_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lettings" ADD CONSTRAINT "lettings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewing_sessions" ADD CONSTRAINT "viewing_sessions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewing_sessions" ADD CONSTRAINT "viewing_sessions_letting_id_lettings_id_fk" FOREIGN KEY ("letting_id") REFERENCES "public"."lettings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewing_sessions" ADD CONSTRAINT "viewing_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewing_slots" ADD CONSTRAINT "viewing_slots_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewing_slots" ADD CONSTRAINT "viewing_slots_letting_id_lettings_id_fk" FOREIGN KEY ("letting_id") REFERENCES "public"."lettings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewing_slots" ADD CONSTRAINT "viewing_slots_session_id_viewing_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."viewing_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "letting_facts_letting_idx" ON "letting_facts" USING btree ("letting_id");--> statement-breakpoint
CREATE INDEX "lettings_organisation_idx" ON "lettings" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "viewing_sessions_letting_idx" ON "viewing_sessions" USING btree ("letting_id","starts_at");--> statement-breakpoint
CREATE INDEX "viewing_slots_letting_idx" ON "viewing_slots" USING btree ("letting_id","starts_at");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "landlords" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "letting_facts" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "lettings" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "viewing_sessions" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "viewing_slots" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');