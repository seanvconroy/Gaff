CREATE TABLE "ai_budget_warnings" (
	"month" date PRIMARY KEY NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_budget_warnings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_calls" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_calls_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"task" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"outcome" text NOT NULL,
	"organisation_id" uuid
);
--> statement-breakpoint
ALTER TABLE "ai_calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_calls_occurred_idx" ON "ai_calls" USING btree ("occurred_at");--> statement-breakpoint
CREATE POLICY "ai_budget_warnings_system" ON "ai_budget_warnings" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.rls_bypass', true) = 'on') WITH CHECK (current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "ai_calls_add" ON "ai_calls" AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "ai_calls_read" ON "ai_calls" AS PERMISSIVE FOR SELECT TO public USING (current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "ai_calls_purge" ON "ai_calls" AS PERMISSIVE FOR DELETE TO public USING (current_setting('app.rls_bypass', true) = 'on');