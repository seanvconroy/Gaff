CREATE TABLE "developments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address_line1" text,
	"area" text,
	"county" text,
	"eircode" text,
	"latitude" double precision,
	"longitude" double precision,
	"point_source" text,
	"point_set_at" timestamp with time zone,
	"parking" text,
	"description" text,
	"public_ref" text DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) NOT NULL,
	"setup_step" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "developments_publicRef_unique" UNIQUE("public_ref"),
	CONSTRAINT "developments_point_whole" CHECK (("developments"."latitude" is null) = ("developments"."longitude" is null) and ("developments"."latitude" is null) = ("developments"."point_source" is null)),
	CONSTRAINT "developments_point_in_ireland" CHECK ("developments"."latitude" is null or ("developments"."latitude" between 51.3 and 55.5 and "developments"."longitude" between -10.7 and -5.3))
);
--> statement-breakpoint
ALTER TABLE "developments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "unit_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"development_id" uuid NOT NULL,
	"name" text NOT NULL,
	"property_type" text NOT NULL,
	"bedrooms" integer NOT NULL,
	"bathrooms" integer,
	"furnished" text,
	"ber_rating" text,
	"floor_area_sqm" integer,
	"monthly_rent_cents" integer,
	"home_count" integer,
	"public_ref" text DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_types_publicRef_unique" UNIQUE("public_ref")
);
--> statement-breakpoint
ALTER TABLE "unit_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "letting_photos" DROP CONSTRAINT "letting_photos_one_home";--> statement-breakpoint
ALTER TABLE "letting_photos" ADD COLUMN "development_id" uuid;--> statement-breakpoint
ALTER TABLE "letting_photos" ADD COLUMN "unit_type_id" uuid;--> statement-breakpoint
ALTER TABLE "letting_photos" ADD COLUMN "shared_from_id" uuid;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "development_id" uuid;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "unit_type_id" uuid;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "unit_label" text;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "unit_floor" integer;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "own_values" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "developments" ADD CONSTRAINT "developments_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developments" ADD CONSTRAINT "developments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_types" ADD CONSTRAINT "unit_types_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_types" ADD CONSTRAINT "unit_types_development_id_developments_id_fk" FOREIGN KEY ("development_id") REFERENCES "public"."developments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_types" ADD CONSTRAINT "unit_types_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "developments_organisation_idx" ON "developments" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "unit_types_development_idx" ON "unit_types" USING btree ("development_id");--> statement-breakpoint
ALTER TABLE "letting_photos" ADD CONSTRAINT "letting_photos_development_id_developments_id_fk" FOREIGN KEY ("development_id") REFERENCES "public"."developments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letting_photos" ADD CONSTRAINT "letting_photos_unit_type_id_unit_types_id_fk" FOREIGN KEY ("unit_type_id") REFERENCES "public"."unit_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letting_photos" ADD CONSTRAINT "letting_photos_shared_from_id_letting_photos_id_fk" FOREIGN KEY ("shared_from_id") REFERENCES "public"."letting_photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lettings" ADD CONSTRAINT "lettings_development_id_developments_id_fk" FOREIGN KEY ("development_id") REFERENCES "public"."developments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lettings" ADD CONSTRAINT "lettings_unit_type_id_unit_types_id_fk" FOREIGN KEY ("unit_type_id") REFERENCES "public"."unit_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "letting_photos_development_idx" ON "letting_photos" USING btree ("development_id","position");--> statement-breakpoint
CREATE INDEX "letting_photos_unit_type_idx" ON "letting_photos" USING btree ("unit_type_id","position");--> statement-breakpoint
CREATE INDEX "lettings_unit_type_idx" ON "lettings" USING btree ("unit_type_id");--> statement-breakpoint
ALTER TABLE "letting_photos" ADD CONSTRAINT "letting_photos_one_home" CHECK (num_nonnulls("letting_photos"."letting_id", "letting_photos"."draft_id", "letting_photos"."development_id", "letting_photos"."unit_type_id") = 1);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "developments" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "unit_types" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');