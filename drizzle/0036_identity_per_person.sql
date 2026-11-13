CREATE TABLE "identity_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"selfie" boolean DEFAULT true NOT NULL,
	"verified_name_sealed" text,
	"provider" text NOT NULL,
	"provider_ref" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"reason" text,
	"consent_version" text,
	"consented_at" timestamp with time zone,
	"checked_at" timestamp with time zone,
	"checked_by" text,
	"provider_redacted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_checks_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "identity_checks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "mobile_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "mobile_pending" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "mobile_code_hash" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "mobile_code_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "mobile_code_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "mobile_codes_today" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "mobile_code_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_checks" ADD CONSTRAINT "identity_checks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_checks" ADD CONSTRAINT "identity_checks_checked_by_users_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "identity_checks_provider_ref_idx" ON "identity_checks" USING btree ("provider_ref");--> statement-breakpoint
CREATE POLICY "renter_isolation" ON "identity_checks" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.user_id', true), '') or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '') or current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
-- Q48: landlords' ID checks (M24) move to the person. Each person keeps their latest check; the
-- workspace copies in letter_checks stay as they are. Names stay in those copies: SQL can't seal.
INSERT INTO "identity_checks" ("user_id", "status", "selfie", "provider", "provider_ref", "attempts", "reason", "checked_at", "provider_redacted_at")
SELECT DISTINCT ON ("user_id")
  "user_id",
  CASE "status" WHEN 'passed' THEN 'verified' WHEN 'failed' THEN 'not_verified' ELSE 'pending' END,
  true,
  CASE WHEN "provider_ref" IS NULL OR "provider_ref" LIKE 'stand-in-%' THEN 'stand_in' ELSE 'stripe' END,
  "provider_ref",
  1,
  CASE WHEN "reason" IN ('document', 'face_mismatch', 'gave_up') THEN "reason" ELSE NULL END,
  "checked_at",
  "provider_redacted_at"
FROM "letter_checks"
WHERE "method" = 'id_document' AND "user_id" IS NOT NULL
ORDER BY "user_id", "checked_at" DESC NULLS LAST
ON CONFLICT ("user_id") DO NOTHING;
