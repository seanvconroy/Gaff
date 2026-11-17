CREATE TABLE "waiting_enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"letting_id" uuid NOT NULL,
	"ref" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"email_normalised" text NOT NULL,
	"answers" jsonb NOT NULL,
	"question" text,
	"sent_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token_hash" text NOT NULL,
	"reply_subject" text NOT NULL,
	"reply_body" text NOT NULL,
	"reply_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waiting_enquiries_ref_unique" UNIQUE("ref"),
	CONSTRAINT "waiting_enquiries_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "waiting_enquiries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "waiting_enquiries" ADD CONSTRAINT "waiting_enquiries_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_enquiries" ADD CONSTRAINT "waiting_enquiries_letting_id_lettings_id_fk" FOREIGN KEY ("letting_id") REFERENCES "public"."lettings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "waiting_enquiries_letting_email_idx" ON "waiting_enquiries" USING btree ("letting_id","email_normalised");--> statement-breakpoint
CREATE INDEX "waiting_enquiries_expires_idx" ON "waiting_enquiries" USING btree ("expires_at");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "waiting_enquiries" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');