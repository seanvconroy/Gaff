CREATE TABLE "landlord_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"letting_id" uuid NOT NULL,
	"preferred_id" uuid NOT NULL,
	"backup_id" uuid,
	"status" text DEFAULT 'requested' NOT NULL,
	"preferred_answer" text,
	"backup_answer" text,
	"requested_by" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "landlord_approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "landlord_approvals" ADD CONSTRAINT "landlord_approvals_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landlord_approvals" ADD CONSTRAINT "landlord_approvals_letting_id_lettings_id_fk" FOREIGN KEY ("letting_id") REFERENCES "public"."lettings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landlord_approvals" ADD CONSTRAINT "landlord_approvals_preferred_id_applications_id_fk" FOREIGN KEY ("preferred_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landlord_approvals" ADD CONSTRAINT "landlord_approvals_backup_id_applications_id_fk" FOREIGN KEY ("backup_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landlord_approvals" ADD CONSTRAINT "landlord_approvals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "landlord_approvals_letting_idx" ON "landlord_approvals" USING btree ("organisation_id","letting_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "landlord_approvals" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');