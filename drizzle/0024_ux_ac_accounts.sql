ALTER TYPE "public"."organisation_kind" ADD VALUE 'private_landlord';--> statement-breakpoint
ALTER TYPE "public"."actor_type" ADD VALUE 'staff';--> statement-breakpoint
CREATE TABLE "join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"answer" text
);
--> statement-breakpoint
ALTER TABLE "join_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organisation_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "member_role" NOT NULL,
	"invited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organisation_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "psra_register" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"licence_number" text NOT NULL,
	"registered_name" text NOT NULL,
	"trading_name" text,
	"licence_type" text NOT NULL,
	"county" text NOT NULL,
	"search_text" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "psra_register_licenceNumber_unique" UNIQUE("licence_number")
);
--> statement-breakpoint
CREATE TABLE "psra_register_refreshes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "psra_register_refreshes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source" text NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entries" integer NOT NULL,
	"added" integer NOT NULL,
	"removed" integer NOT NULL,
	"lapsed" integer NOT NULL,
	"renewed" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"renting_since" timestamp with time zone,
	"last_side" text,
	"last_organisation_id" uuid,
	"first_run_purpose" text,
	"first_run_register_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "go_live_held_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "go_live_decision_id" uuid;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "psra_register_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "confirmed_by" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "licence_lapsed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_invites" ADD CONSTRAINT "organisation_invites_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_invites" ADD CONSTRAINT "organisation_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_last_organisation_id_organisations_id_fk" FOREIGN KEY ("last_organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_first_run_register_entry_id_psra_register_id_fk" FOREIGN KEY ("first_run_register_entry_id") REFERENCES "public"."psra_register"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "join_requests_org_user_idx" ON "join_requests" USING btree ("organisation_id","user_id");--> statement-breakpoint
CREATE INDEX "join_requests_user_idx" ON "join_requests" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organisation_invites_org_email_idx" ON "organisation_invites" USING btree ("organisation_id","email");--> statement-breakpoint
CREATE INDEX "organisation_invites_email_idx" ON "organisation_invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "psra_register_search_idx" ON "psra_register" USING btree ("search_text");--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_psra_register_entry_id_psra_register_id_fk" FOREIGN KEY ("psra_register_entry_id") REFERENCES "public"."psra_register"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organisations_confirmed_register_entry_idx" ON "organisations" USING btree ("psra_register_entry_id") WHERE "organisations"."confirmed_at" is not null;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "join_requests" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "own_row" ON "join_requests" AS PERMISSIVE FOR SELECT TO public USING (user_id = nullif(current_setting('app.person_id', true), ''));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "organisation_invites" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "person_only" ON "profiles" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.person_id', true), '') or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (user_id = nullif(current_setting('app.person_id', true), '') or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
-- UX-AG-1, Q32: a licence number is no longer typed. It comes from the agency's entry in the PSRA
-- register, and an agency is confirmed by a person at Gaff. An agency set up before this has a
-- typed number that nobody checked and no register entry, so the number is cleared: the agency
-- reads as having no licence found yet, and its admin finds it on the register (UX-AG-2).
UPDATE "organisations" SET "psra_licence_number" = NULL WHERE "kind" = 'agency' AND "psra_register_entry_id" IS NULL;
