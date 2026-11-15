CREATE TABLE "funnel_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "funnel_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"step" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"variant" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "funnel_events_step_is_code" CHECK ("funnel_events"."step" ~ '^[a-z][a-z_]*[.][a-z][a-z_]*$'),
	CONSTRAINT "funnel_events_subject_type_is_code" CHECK ("funnel_events"."subject_type" ~ '^[a-z][a-z_]*$'),
	CONSTRAINT "funnel_events_variant_is_code" CHECK ("funnel_events"."variant" is null or "funnel_events"."variant" ~ '^[a-z][a-z_]*$')
);
--> statement-breakpoint
ALTER TABLE "funnel_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "funnel_events_step_subject_idx" ON "funnel_events" USING btree ("step","subject_id");--> statement-breakpoint
CREATE INDEX "funnel_events_occurred_idx" ON "funnel_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE POLICY "funnel_events_add" ON "funnel_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "funnel_events_read" ON "funnel_events" AS PERMISSIVE FOR SELECT TO public USING (current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "funnel_events_purge" ON "funnel_events" AS PERMISSIVE FOR DELETE TO public USING (current_setting('app.rls_bypass', true) = 'on');