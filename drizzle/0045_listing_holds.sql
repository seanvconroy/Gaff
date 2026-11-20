CREATE TABLE "lister_pauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"case_id" uuid,
	"reason" text NOT NULL,
	"facts" text[] NOT NULL,
	"paused_at" timestamp with time zone NOT NULL,
	"paused_by" text,
	"appeal_asked_at" timestamp with time zone,
	"appeal_due_by" timestamp with time zone,
	"appeal_decision" text,
	"appeal_decided_at" timestamp with time zone,
	"appeal_decided_by" text,
	"ended_at" timestamp with time zone,
	"ended_by" text,
	"delete_after" timestamp with time zone NOT NULL,
	CONSTRAINT "lister_pauses_facts" CHECK (cardinality("lister_pauses"."facts") > 0)
);
--> statement-breakpoint
ALTER TABLE "lister_pauses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "hidden_after" text;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "screened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "listings_paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listing_cases" ADD COLUMN "signals" text[];--> statement-breakpoint
ALTER TABLE "listing_cases" ADD COLUMN "findings" jsonb;--> statement-breakpoint
ALTER TABLE "lister_pauses" ADD CONSTRAINT "lister_pauses_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lister_pauses" ADD CONSTRAINT "lister_pauses_case_id_listing_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."listing_cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lister_pauses" ADD CONSTRAINT "lister_pauses_paused_by_users_id_fk" FOREIGN KEY ("paused_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lister_pauses" ADD CONSTRAINT "lister_pauses_appeal_decided_by_users_id_fk" FOREIGN KEY ("appeal_decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lister_pauses" ADD CONSTRAINT "lister_pauses_ended_by_users_id_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lister_pauses_organisation_idx" ON "lister_pauses" USING btree ("organisation_id","ended_at");--> statement-breakpoint
ALTER TABLE "listing_cases" ADD CONSTRAINT "listing_cases_hold_has_signals" CHECK (("listing_cases"."kind" = 'hold') = ("listing_cases"."signals" is not null and cardinality("listing_cases"."signals") > 0));--> statement-breakpoint
CREATE POLICY "lister_pauses_system" ON "lister_pauses" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.rls_bypass', true) = 'on') WITH CHECK (current_setting('app.rls_bypass', true) = 'on');