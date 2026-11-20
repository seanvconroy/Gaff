CREATE TABLE "check_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"letting_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"check_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text,
	"content_type" text,
	"reading_sealed" text,
	"read_by" text NOT NULL,
	"flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"document_date" date,
	"corrected_by_renter" boolean DEFAULT false NOT NULL,
	"shared_at" timestamp with time zone NOT NULL,
	"delete_after" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "check_documents_regular_income_has_no_file" CHECK ("check_documents"."kind" <> 'regular_income' or ("check_documents"."storage_key" is null and "check_documents"."content_type" is null))
);
--> statement-breakpoint
ALTER TABLE "check_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dev_document_store" (
	"key" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dev_document_store" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "renter_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"user_id" text,
	"kind" text NOT NULL,
	"storage_key" text,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"pages" integer DEFAULT 1 NOT NULL,
	"reading_sealed" text,
	"read_by" text DEFAULT 'nobody' NOT NULL,
	"document_date" date,
	"corrected_by_renter" boolean DEFAULT false NOT NULL,
	"confirmed_at" timestamp with time zone,
	"shared_at" timestamp with time zone,
	"delete_after" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "renter_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "check_documents" ADD CONSTRAINT "check_documents_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_documents" ADD CONSTRAINT "check_documents_letting_id_lettings_id_fk" FOREIGN KEY ("letting_id") REFERENCES "public"."lettings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_documents" ADD CONSTRAINT "check_documents_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_documents" ADD CONSTRAINT "check_documents_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renter_documents" ADD CONSTRAINT "renter_documents_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renter_documents" ADD CONSTRAINT "renter_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "check_documents_application_idx" ON "check_documents" USING btree ("organisation_id","application_id");--> statement-breakpoint
CREATE INDEX "check_documents_delete_idx" ON "check_documents" USING btree ("delete_after");--> statement-breakpoint
CREATE INDEX "renter_documents_application_idx" ON "renter_documents" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "renter_documents_user_idx" ON "renter_documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "renter_documents_delete_idx" ON "renter_documents" USING btree ("delete_after");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "check_documents" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "dev_document_store_system" ON "dev_document_store" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.rls_bypass', true) = 'on') WITH CHECK (current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "applicant_only" ON "renter_documents" AS PERMISSIVE FOR ALL TO public USING (application_id = nullif(current_setting('app.applicant_id', true), '')::uuid or user_id = nullif(current_setting('app.person_id', true), '') or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (application_id = nullif(current_setting('app.applicant_id', true), '')::uuid or user_id = nullif(current_setting('app.person_id', true), '') or current_setting('app.rls_bypass', true) = 'on');