CREATE TABLE "moderation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"listing_id" uuid,
	"subject_organisation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"ground" text,
	"statement_template" text,
	"automatic" text DEFAULT 'no' NOT NULL,
	"decided_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "moderation_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "moderation_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"subject_organisation_id" uuid NOT NULL,
	"source" text NOT NULL,
	"reasons" text[] NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"due_by" timestamp with time zone NOT NULL,
	"appeal_of" uuid,
	"appeal_text" text,
	"decision" text,
	"decision_reason" text,
	"decided_by" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "moderation_cases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"reporter_email" text,
	"reporter_user_id" text,
	"reporter_hash" text NOT NULL,
	"delete_after" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "marketplace_status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_case_id_moderation_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."moderation_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_subject_organisation_id_organisations_id_fk" FOREIGN KEY ("subject_organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_subject_organisation_id_organisations_id_fk" FOREIGN KEY ("subject_organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_case_id_moderation_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."moderation_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moderation_actions_case_idx" ON "moderation_actions" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "moderation_cases_open_idx" ON "moderation_cases" USING btree ("status","due_by");--> statement-breakpoint
CREATE INDEX "moderation_cases_listing_idx" ON "moderation_cases" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "reports_case_idx" ON "reports" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "reports_hash_idx" ON "reports" USING btree ("reporter_hash","created_at");--> statement-breakpoint
CREATE POLICY "staff_zone" ON "moderation_actions" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.role', true) = 'staff' or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (current_setting('app.role', true) = 'staff' or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "staff_zone" ON "moderation_cases" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.role', true) = 'staff' or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (current_setting('app.role', true) = 'staff' or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "staff_zone" ON "reports" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.role', true) = 'staff' or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (current_setting('app.role', true) = 'staff' or current_setting('app.rls_bypass', true) = 'on');