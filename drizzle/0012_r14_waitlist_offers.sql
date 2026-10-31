CREATE TABLE "waitlist_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"letting_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"offered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "waitlist_offers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "waitlist_offers" ADD CONSTRAINT "waitlist_offers_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_offers" ADD CONSTRAINT "waitlist_offers_letting_id_lettings_id_fk" FOREIGN KEY ("letting_id") REFERENCES "public"."lettings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_offers" ADD CONSTRAINT "waitlist_offers_slot_id_viewing_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."viewing_slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_offers" ADD CONSTRAINT "waitlist_offers_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "waitlist_offers_slot_idx" ON "waitlist_offers" USING btree ("slot_id","status");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "waitlist_offers" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');