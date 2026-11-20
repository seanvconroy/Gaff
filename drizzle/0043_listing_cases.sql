CREATE TABLE "listing_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"letting_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"reasons" text[] NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_by" timestamp with time zone NOT NULL,
	"held_at" timestamp with time zone,
	"appeal_of" uuid,
	"decision" text,
	"decision_reason" text,
	"decision_facts" text[],
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"delete_after" timestamp with time zone NOT NULL,
	CONSTRAINT "listing_cases_reasons_with_hiding" CHECK (("listing_cases"."decision" = 'hide_listing' and "listing_cases"."decision_reason" is not null and cardinality("listing_cases"."decision_facts") > 0)
        or ("listing_cases"."decision" is distinct from 'hide_listing' and "listing_cases"."decision_reason" is null and "listing_cases"."decision_facts" is null)),
	CONSTRAINT "listing_cases_appeal_has_case" CHECK (("listing_cases"."kind" = 'appeal') = ("listing_cases"."appeal_of" is not null))
);
--> statement-breakpoint
ALTER TABLE "listing_cases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "listing_reports" DROP CONSTRAINT "listing_reports_answered_by_users_id_fk";
--> statement-breakpoint
DROP INDEX "listing_reports_open_idx";--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "hidden_stage" text;--> statement-breakpoint
ALTER TABLE "listing_reports" ADD COLUMN "case_id" uuid;--> statement-breakpoint
ALTER TABLE "listing_reports" ADD COLUMN "outcome_email" text;--> statement-breakpoint
ALTER TABLE "listing_cases" ADD CONSTRAINT "listing_cases_letting_id_lettings_id_fk" FOREIGN KEY ("letting_id") REFERENCES "public"."lettings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_cases" ADD CONSTRAINT "listing_cases_appeal_of_listing_cases_id_fk" FOREIGN KEY ("appeal_of") REFERENCES "public"."listing_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_cases" ADD CONSTRAINT "listing_cases_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_cases_open_idx" ON "listing_cases" USING btree ("decision","due_by");--> statement-breakpoint
CREATE INDEX "listing_cases_letting_idx" ON "listing_cases" USING btree ("letting_id");--> statement-breakpoint
CREATE INDEX "listing_cases_appeal_idx" ON "listing_cases" USING btree ("appeal_of");--> statement-breakpoint
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_case_id_listing_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."listing_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_reports_case_idx" ON "listing_reports" USING btree ("case_id");--> statement-breakpoint
-- BA-9: each home's reports so far become one case. A hidden home's case is decided (hidden,
-- relying on the reports); one whose reports were all answered is decided (no action); any
-- other is open, due a day after its first report. A hidden home can be asked about again.
SELECT set_config('app.rls_bypass', 'on', true);--> statement-breakpoint
INSERT INTO "listing_cases" ("letting_id", "kind", "reasons", "opened_at", "due_by", "decision", "decision_reason", "decision_facts", "decided_at", "delete_after")
SELECT r."letting_id", 'report', array_agg(DISTINCT r."reason"), min(r."received_at"), min(r."received_at") + interval '1 day',
  CASE WHEN l."hidden_at" IS NOT NULL THEN 'hide_listing' WHEN bool_and(r."outcome" IS NOT NULL) THEN 'no_action' END,
  CASE WHEN l."hidden_at" IS NOT NULL THEN coalesce(l."hidden_reason", 'something_else') END,
  CASE WHEN l."hidden_at" IS NOT NULL THEN ARRAY['reports']::text[] END,
  CASE WHEN l."hidden_at" IS NOT NULL THEN coalesce(max(r."answered_at"), l."hidden_at") WHEN bool_and(r."outcome" IS NOT NULL) THEN max(r."answered_at") END,
  max(r."delete_after")
FROM "listing_reports" r JOIN "lettings" l ON l."id" = r."letting_id"
GROUP BY r."letting_id", l."hidden_at", l."hidden_reason";--> statement-breakpoint
UPDATE "listing_reports" r SET "case_id" = c."id" FROM "listing_cases" c WHERE c."letting_id" = r."letting_id";--> statement-breakpoint
UPDATE "lettings" SET "hidden_stage" = 'decided', "look_again_asked_at" = NULL WHERE "hidden_at" IS NOT NULL;--> statement-breakpoint
SELECT set_config('app.rls_bypass', '', true);--> statement-breakpoint
ALTER TABLE "listing_reports" ALTER COLUMN "case_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_reports" DROP COLUMN "outcome";--> statement-breakpoint
ALTER TABLE "listing_reports" DROP COLUMN "answered_at";--> statement-breakpoint
ALTER TABLE "listing_reports" DROP COLUMN "answered_by";--> statement-breakpoint
ALTER TABLE "listing_reports" DROP COLUMN "delete_after";--> statement-breakpoint
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_outcome_email_short" CHECK ("listing_reports"."outcome_email" is null or char_length("listing_reports"."outcome_email") <= 254);--> statement-breakpoint
CREATE POLICY "listing_cases_system" ON "listing_cases" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.rls_bypass', true) = 'on') WITH CHECK (current_setting('app.rls_bypass', true) = 'on');