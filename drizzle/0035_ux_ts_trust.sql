CREATE TABLE "listing_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"letting_id" uuid NOT NULL,
	"home_ref" text NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" text,
	"answered_at" timestamp with time zone,
	"answered_by" text,
	"delete_after" timestamp with time zone NOT NULL,
	CONSTRAINT "listing_reports_note_only_for_something_else" CHECK ("listing_reports"."note" is null or ("listing_reports"."reason" = 'something_else' and char_length("listing_reports"."note") <= 500))
);
--> statement-breakpoint
ALTER TABLE "listing_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "hidden_reason" text;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "look_again_asked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_letting_id_lettings_id_fk" FOREIGN KEY ("letting_id") REFERENCES "public"."lettings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_answered_by_users_id_fk" FOREIGN KEY ("answered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_reports_open_idx" ON "listing_reports" USING btree ("outcome","received_at");--> statement-breakpoint
CREATE INDEX "listing_reports_letting_idx" ON "listing_reports" USING btree ("letting_id");--> statement-breakpoint
CREATE POLICY "listing_reports_system" ON "listing_reports" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.rls_bypass', true) = 'on') WITH CHECK (current_setting('app.rls_bypass', true) = 'on');