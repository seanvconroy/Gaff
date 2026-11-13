CREATE TABLE "profile_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"organisation_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"data_group" text NOT NULL,
	"shared_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_shares_application_group" UNIQUE("application_id","data_group")
);
--> statement-breakpoint
ALTER TABLE "profile_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "renter_enquiries" (
	"application_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organisation_id" uuid NOT NULL,
	"letting_id" uuid NOT NULL,
	"listing_id" uuid,
	"title" text NOT NULL,
	"address_shown" text NOT NULL,
	"slug" text,
	"letter_name" text NOT NULL,
	"enquired_at" timestamp with time zone NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "renter_enquiries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "renter_user_id" text;--> statement-breakpoint
ALTER TABLE "public_listings" ADD COLUMN "questions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "renter_profiles" ADD COLUMN "answers" jsonb;--> statement-breakpoint
ALTER TABLE "profile_shares" ADD CONSTRAINT "profile_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_shares" ADD CONSTRAINT "profile_shares_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renter_enquiries" ADD CONSTRAINT "renter_enquiries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renter_enquiries" ADD CONSTRAINT "renter_enquiries_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_renter_user_id_users_id_fk" FOREIGN KEY ("renter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_renter_idx" ON "applications" USING btree ("renter_user_id") WHERE renter_user_id is not null;--> statement-breakpoint
CREATE INDEX "messages_application_idx" ON "messages" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE POLICY "renter_read" ON "applications" AS PERMISSIVE FOR SELECT TO public USING (renter_user_id = nullif(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "renter_read" ON "messages" AS PERMISSIVE FOR SELECT TO public USING (nullif(current_setting('app.user_id', true), '') is not null and messages.status in ('received', 'sent') and exists (select 1 from applications a where a.id = messages.application_id and a.renter_user_id = nullif(current_setting('app.user_id', true), '')));--> statement-breakpoint
CREATE POLICY "renter_isolation" ON "profile_shares" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.user_id', true), '') or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '') or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "renter_isolation" ON "renter_enquiries" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.user_id', true), '') or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '') or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
SELECT set_config('app.rls_bypass', 'on', true);--> statement-breakpoint
UPDATE "public_listings" AS p SET "questions" = (
	SELECT coalesce(jsonb_agg(v.q ORDER BY v.n), '[]'::jsonb)
	FROM (VALUES
		(1, 'moveInDate', l.criteria->>'moveInBy' IS NOT NULL),
		(2, 'stayMonths', l.criteria->>'minStayMonths' IS NOT NULL),
		(3, 'occupants', l.criteria->>'maxOccupants' IS NOT NULL),
		(4, 'hasPets', coalesce((l.criteria->>'noPets')::boolean, false))
	) AS v(n, q, asked)
	WHERE v.asked
) FROM "listings" AS li JOIN "lettings" AS l ON l.id = li.letting_id WHERE li.id = p.listing_id;--> statement-breakpoint
SELECT set_config('app.rls_bypass', 'off', true);
