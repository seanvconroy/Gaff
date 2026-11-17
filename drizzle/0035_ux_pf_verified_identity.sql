CREATE TABLE "identity_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"reason" text,
	"provider" text,
	"provider_ref" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity_checks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "verified_identities" (
	"user_id" text PRIMARY KEY NOT NULL,
	"verified_name" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verified_identities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "identity_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_checks" ADD CONSTRAINT "identity_checks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_identities" ADD CONSTRAINT "verified_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "identity_checks_user_idx" ON "identity_checks" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "person_only" ON "identity_checks" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.person_id', true), '') or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (user_id = nullif(current_setting('app.person_id', true), '') or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "person_only" ON "verified_identities" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.person_id', true), '') or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (user_id = nullif(current_setting('app.person_id', true), '') or current_setting('app.rls_bypass', true) = 'on');