CREATE TABLE "public_developments" (
	"development_id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"area" text NOT NULL,
	"county" text NOT NULL,
	"routing_key" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"description" text NOT NULL,
	"amenities" text[] NOT NULL,
	"photos" jsonb NOT NULL,
	"operator" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_developments_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "public_developments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public_developments" ADD CONSTRAINT "public_developments_development_id_developments_id_fk" FOREIGN KEY ("development_id") REFERENCES "public"."developments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_developments" ADD CONSTRAINT "public_developments_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "public_developments" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "public_read" ON "public_developments" AS PERMISSIVE FOR SELECT TO public USING (true);