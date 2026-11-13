CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"email" text,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "letter_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"user_id" text,
	"method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"licence_number" text,
	"verified_name" text,
	"provider_ref" text,
	"reason" text,
	"checked_at" timestamp with time zone,
	"checked_by" text,
	"provider_redacted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "letter_checks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "phone_confirmations" (
	"user_id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text,
	"code_expires_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sends_today" integer DEFAULT 0 NOT NULL,
	"last_sent_at" timestamp with time zone,
	"confirmed_phone" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "phone_confirmations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "staff_members" (
	"user_id" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "photo_media_id" uuid;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "psra_licence_number" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "show_phone" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "public_phone" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "office_address" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "public_phone" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "about" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "logo_media_id" uuid;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_checks" ADD CONSTRAINT "letter_checks_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_checks" ADD CONSTRAINT "letter_checks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_checks" ADD CONSTRAINT "letter_checks_checked_by_users_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_confirmations" ADD CONSTRAINT "phone_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitations_organisation_idx" ON "invitations" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "letter_checks_subject_method" ON "letter_checks" USING btree ("organisation_id",coalesce("user_id", ''),"method");--> statement-breakpoint
CREATE INDEX "letter_checks_queue_idx" ON "letter_checks" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "letter_checks_provider_ref_idx" ON "letter_checks" USING btree ("provider_ref");--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_slug_unique" UNIQUE("slug");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "invitations" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "letter_checks" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "staff_review" ON "letter_checks" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.role', true) = 'staff') WITH CHECK (current_setting('app.role', true) = 'staff');--> statement-breakpoint
CREATE POLICY "renter_isolation" ON "phone_confirmations" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.user_id', true), '') or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '') or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
-- M23: agencies already on Gaff get their licence into the check queue.
INSERT INTO "letter_checks" ("organisation_id", "method", "status", "licence_number")
SELECT "id", 'psra_register', 'pending', "psra_licence_number" FROM "organisations"
WHERE "kind" = 'agency' AND "psra_licence_number" IS NOT NULL;
