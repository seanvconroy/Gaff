CREATE TABLE "activity_minutes" (
	"organisation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"letting_id" uuid,
	"minute" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_minutes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_minutes" ADD CONSTRAINT "activity_minutes_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_minutes" ADD CONSTRAINT "activity_minutes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_minutes" ADD CONSTRAINT "activity_minutes_letting_id_lettings_id_fk" FOREIGN KEY ("letting_id") REFERENCES "public"."lettings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_minutes_user_minute_idx" ON "activity_minutes" USING btree ("user_id","minute");--> statement-breakpoint
CREATE INDEX "activity_minutes_letting_idx" ON "activity_minutes" USING btree ("organisation_id","letting_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "activity_minutes" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');