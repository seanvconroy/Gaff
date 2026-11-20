CREATE TABLE "saved_homes" (
	"user_id" text NOT NULL,
	"home_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_homes_user_id_home_ref_pk" PRIMARY KEY("user_id","home_ref")
);
--> statement-breakpoint
ALTER TABLE "saved_homes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"email" text,
	"filters" jsonb NOT NULL,
	"search_key" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"token_hash" text NOT NULL,
	"token_sealed" text NOT NULL,
	"told_home_refs" text[] DEFAULT '{}'::text[] NOT NULL,
	"last_alert_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_searches_tokenHash_unique" UNIQUE("token_hash"),
	CONSTRAINT "saved_searches_one_holder" CHECK (("saved_searches"."user_id" is null) <> ("saved_searches"."email" is null))
);
--> statement-breakpoint
ALTER TABLE "saved_searches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "renter_profiles" ADD COLUMN "search_alerts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_homes" ADD CONSTRAINT "saved_homes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_searches_person_key" ON "saved_searches" USING btree ("user_id","search_key") WHERE "saved_searches"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_searches_email_key" ON "saved_searches" USING btree ("email","search_key") WHERE "saved_searches"."email" is not null;--> statement-breakpoint
CREATE POLICY "person_only" ON "saved_homes" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.person_id', true), '') or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (user_id = nullif(current_setting('app.person_id', true), '') or current_setting('app.rls_bypass', true) = 'on');--> statement-breakpoint
CREATE POLICY "person_only" ON "saved_searches" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.person_id', true), '') or current_setting('app.rls_bypass', true) = 'on') WITH CHECK (user_id = nullif(current_setting('app.person_id', true), '') or current_setting('app.rls_bypass', true) = 'on');