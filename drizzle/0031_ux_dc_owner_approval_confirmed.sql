ALTER TABLE "landlord_approvals" ADD COLUMN "confirmed_by" text;--> statement-breakpoint
ALTER TABLE "landlord_approvals" ADD COLUMN "reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "landlord_approvals" ADD CONSTRAINT "landlord_approvals_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;