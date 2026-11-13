ALTER TYPE "public"."actor_type" ADD VALUE 'staff';--> statement-breakpoint
CREATE TABLE "platform_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "platform_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"type" text NOT NULL,
	"subject_type" text,
	"subject_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "platform_events_subject_idx" ON "platform_events" USING btree ("subject_type","subject_id","occurred_at");--> statement-breakpoint
CREATE POLICY "platform_append" ON "platform_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "staff_read" ON "platform_events" AS PERMISSIVE FOR SELECT TO public USING (current_setting('app.role', true) = 'staff' or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
-- ADR-0006: append-only, like events (the same function, with its deliberate purge switch).
CREATE TRIGGER platform_events_append_only
BEFORE UPDATE OR DELETE ON platform_events
FOR EACH ROW EXECUTE FUNCTION events_append_only();
