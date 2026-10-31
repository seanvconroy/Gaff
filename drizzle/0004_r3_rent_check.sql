CREATE TABLE "rent_checks" (
	"letting_id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"last_let" text NOT NULL,
	"ending" text,
	"substantial_change" boolean DEFAULT false NOT NULL,
	"previous_rent_cents" integer,
	"previous_rent_set_on" date,
	"result" text NOT NULL,
	"reason" text NOT NULL,
	"rules_version" text NOT NULL,
	"checked_by" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rent_checks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rent_checks" ADD CONSTRAINT "rent_checks_letting_id_lettings_id_fk" FOREIGN KEY ("letting_id") REFERENCES "public"."lettings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_checks" ADD CONSTRAINT "rent_checks_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_checks" ADD CONSTRAINT "rent_checks_checked_by_users_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "rent_checks" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');