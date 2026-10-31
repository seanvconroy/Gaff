CREATE TABLE "ai_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"source_message_id" uuid NOT NULL,
	"draft_message_id" uuid,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"fact_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"answered" integer NOT NULL,
	"to_operator" integer NOT NULL,
	"refused" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_drafts_sourceMessageId_unique" UNIQUE("source_message_id")
);
--> statement-breakpoint
ALTER TABLE "ai_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "operator_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"letting_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"source_message_id" uuid NOT NULL,
	"question" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"answer_fact_id" uuid,
	"answered_by" text,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "operator_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_draft_message_id_messages_id_fk" FOREIGN KEY ("draft_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_questions" ADD CONSTRAINT "operator_questions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_questions" ADD CONSTRAINT "operator_questions_letting_id_lettings_id_fk" FOREIGN KEY ("letting_id") REFERENCES "public"."lettings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_questions" ADD CONSTRAINT "operator_questions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_questions" ADD CONSTRAINT "operator_questions_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_questions" ADD CONSTRAINT "operator_questions_answer_fact_id_letting_facts_id_fk" FOREIGN KEY ("answer_fact_id") REFERENCES "public"."letting_facts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_questions" ADD CONSTRAINT "operator_questions_answered_by_users_id_fk" FOREIGN KEY ("answered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operator_questions_status_idx" ON "operator_questions" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "ai_drafts" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "operator_questions" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');