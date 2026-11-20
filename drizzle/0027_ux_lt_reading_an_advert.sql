ALTER TABLE "letting_drafts" ADD COLUMN "reading" jsonb;--> statement-breakpoint
ALTER TABLE "letting_drafts" ADD COLUMN "inbound_email_id" uuid;--> statement-breakpoint
ALTER TABLE "letting_drafts" ADD CONSTRAINT "letting_drafts_inbound_email_id_inbound_emails_id_fk" FOREIGN KEY ("inbound_email_id") REFERENCES "public"."inbound_emails"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "letting_drafts_inbound_email_idx" ON "letting_drafts" USING btree ("inbound_email_id");