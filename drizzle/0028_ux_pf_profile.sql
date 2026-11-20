CREATE TABLE "profile_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "profile_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "renter_enquiries" (
	"application_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"lister_organisation_id" uuid NOT NULL,
	"letting_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "renter_enquiries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "renter_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"keeps_details" boolean DEFAULT true NOT NULL,
	"mobile" text,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"answers_at" timestamp with time zone,
	"earning" text,
	"monthly_income_cents" integer,
	"income_at" timestamp with time zone,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deletion_notice_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "renter_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "renter_enquiries" ADD CONSTRAINT "renter_enquiries_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renter_enquiries" ADD CONSTRAINT "renter_enquiries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renter_enquiries" ADD CONSTRAINT "renter_enquiries_lister_organisation_id_organisations_id_fk" FOREIGN KEY ("lister_organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renter_enquiries" ADD CONSTRAINT "renter_enquiries_letting_id_lettings_id_fk" FOREIGN KEY ("letting_id") REFERENCES "public"."lettings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renter_profiles" ADD CONSTRAINT "renter_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_events_user_idx" ON "profile_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "renter_enquiries_user_idx" ON "renter_enquiries" USING btree ("user_id","letting_id");--> statement-breakpoint
CREATE POLICY "person_only" ON "profile_events" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.person_id', true), '') or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (user_id = nullif(current_setting('app.person_id', true), '') or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "person_only" ON "renter_enquiries" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.person_id', true), '') or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (user_id = nullif(current_setting('app.person_id', true), '') or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "person_only" ON "renter_profiles" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.person_id', true), '') or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (user_id = nullif(current_setting('app.person_id', true), '') or current_setting('app.rls_bypass', true) = 'on');