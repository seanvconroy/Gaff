CREATE TABLE "dev_photo_store" (
	"key" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "letting_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"step" text,
	"previous_letting_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "letting_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "letting_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"letting_id" uuid,
	"draft_id" uuid,
	"position" integer NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "letting_photos_one_home" CHECK (("letting_photos"."letting_id" is null) <> ("letting_photos"."draft_id" is null))
);
--> statement-breakpoint
ALTER TABLE "letting_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lettings" ALTER COLUMN "bathrooms" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lettings" ALTER COLUMN "furnished" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lettings" ALTER COLUMN "ber_rating" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "no_smoking_indoors" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "on_gaff" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "advertised_on" jsonb;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "setup_step" text;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "previous_letting_id" uuid;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "letting_drafts" ADD CONSTRAINT "letting_drafts_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letting_drafts" ADD CONSTRAINT "letting_drafts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letting_drafts" ADD CONSTRAINT "letting_drafts_previous_letting_id_lettings_id_fk" FOREIGN KEY ("previous_letting_id") REFERENCES "public"."lettings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letting_photos" ADD CONSTRAINT "letting_photos_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letting_photos" ADD CONSTRAINT "letting_photos_letting_id_lettings_id_fk" FOREIGN KEY ("letting_id") REFERENCES "public"."lettings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letting_photos" ADD CONSTRAINT "letting_photos_draft_id_letting_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."letting_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letting_photos" ADD CONSTRAINT "letting_photos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "letting_drafts_organisation_idx" ON "letting_drafts" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "letting_photos_letting_idx" ON "letting_photos" USING btree ("letting_id","position");--> statement-breakpoint
CREATE INDEX "letting_photos_draft_idx" ON "letting_photos" USING btree ("draft_id","position");--> statement-breakpoint
ALTER TABLE "lettings" ADD CONSTRAINT "lettings_previous_letting_id_lettings_id_fk" FOREIGN KEY ("previous_letting_id") REFERENCES "public"."lettings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "letting_drafts" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "letting_photos" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');