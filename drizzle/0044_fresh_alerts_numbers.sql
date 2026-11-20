CREATE TABLE "letting_daily_counts" (
	"organisation_id" uuid NOT NULL,
	"letting_id" uuid NOT NULL,
	"day" date NOT NULL,
	"opened" integer DEFAULT 0 NOT NULL,
	"saved" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "letting_daily_counts_letting_id_day_pk" PRIMARY KEY("letting_id","day")
);
--> statement-breakpoint
ALTER TABLE "letting_daily_counts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "confirmed_available_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "freshness_asked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "stale_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "saved_homes" ADD COLUMN "rent_cents_when_saved" integer;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD COLUMN "frequency" text DEFAULT 'instant' NOT NULL;--> statement-breakpoint
ALTER TABLE "letting_daily_counts" ADD CONSTRAINT "letting_daily_counts_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letting_daily_counts" ADD CONSTRAINT "letting_daily_counts_letting_id_lettings_id_fk" FOREIGN KEY ("letting_id") REFERENCES "public"."lettings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "letting_daily_counts" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
-- M49: every home live when freshness starts counts as confirmed then, so nobody is asked on the first day.
UPDATE "lettings" SET "confirmed_available_at" = now() WHERE "status" = 'live';
