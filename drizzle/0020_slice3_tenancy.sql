CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"room" text NOT NULL,
	"item" text NOT NULL,
	"condition" text NOT NULL,
	"note" text,
	"photo" "bytea",
	"photo_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"letting_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"rent_cents" integer NOT NULL,
	"deposit_cents" integer NOT NULL,
	"agreement_status" text DEFAULT 'draft' NOT NULL,
	"agreement_template" text,
	"agreement_hash" text,
	"agreement_sent_at" timestamp with time zone,
	"tenant_signed_at" timestamp with time zone,
	"tenant_signed_name" text,
	"operator_signed_at" timestamp with time zone,
	"operator_signed_by" text,
	"signed_decision_id" uuid,
	"payment_requested_at" timestamp with time zone,
	"payment_due_date" date,
	"payment_reference" text,
	"payment_received_at" timestamp with time zone,
	"payment_confirmed_by" text,
	"ppsn_sealed" text,
	"ppsn_given_at" timestamp with time zone,
	"rtb_registered_at" timestamp with time zone,
	"rtb_registered_by" text,
	"rtb_reference" text,
	"move_in_checklist" jsonb,
	"move_in_completed_at" timestamp with time zone,
	"inventory_shared_at" timestamp with time zone,
	"inventory_confirmed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenancies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "payment_account_name" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "payment_iban" text;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_letting_id_lettings_id_fk" FOREIGN KEY ("letting_id") REFERENCES "public"."lettings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_operator_signed_by_users_id_fk" FOREIGN KEY ("operator_signed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_payment_confirmed_by_users_id_fk" FOREIGN KEY ("payment_confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_rtb_registered_by_users_id_fk" FOREIGN KEY ("rtb_registered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_items_tenancy_idx" ON "inventory_items" USING btree ("organisation_id","tenancy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenancies_letting_idx" ON "tenancies" USING btree ("letting_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "inventory_items" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenancies" AS PERMISSIVE FOR ALL TO public USING (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (organisation_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.rls_bypass', true) = 'on');