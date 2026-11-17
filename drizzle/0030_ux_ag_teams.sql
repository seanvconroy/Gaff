CREATE TABLE "letting_helpers" (
	"organisation_id" uuid NOT NULL,
	"letting_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "letting_helpers_letting_id_user_id_pk" PRIMARY KEY("letting_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "letting_helpers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "lead_user_id" text;--> statement-breakpoint
-- UX-AG-9: a letting's lead is whoever added it, until someone changes it. Row-level security is
-- forced on lettings, so the backfill runs as the system, for this transaction only.
SELECT set_config('app.rls_bypass', 'on', true);--> statement-breakpoint
UPDATE "lettings" SET "lead_user_id" = "created_by";--> statement-breakpoint
SELECT set_config('app.rls_bypass', '', true);--> statement-breakpoint
ALTER TABLE "lettings" ALTER COLUMN "lead_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organisation_invites" ADD COLUMN "sent_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "letting_helpers" ADD CONSTRAINT "letting_helpers_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letting_helpers" ADD CONSTRAINT "letting_helpers_letting_id_lettings_id_fk" FOREIGN KEY ("letting_id") REFERENCES "public"."lettings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letting_helpers" ADD CONSTRAINT "letting_helpers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lettings" ADD CONSTRAINT "lettings_lead_user_id_users_id_fk" FOREIGN KEY ("lead_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" DROP COLUMN "answered_at";--> statement-breakpoint
ALTER TABLE "join_requests" DROP COLUMN "answer";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "letting_helpers" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');