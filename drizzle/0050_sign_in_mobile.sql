CREATE TABLE "sign_in_mobiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"mobile" text NOT NULL,
	"proven_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sign_in_mobiles_mobile_unique" UNIQUE("mobile")
);
--> statement-breakpoint
ALTER TABLE "one_time_codes" ADD COLUMN "channel" text DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "one_time_codes" ADD COLUMN "joining" jsonb;--> statement-breakpoint
ALTER TABLE "sign_in_mobiles" ADD CONSTRAINT "sign_in_mobiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;