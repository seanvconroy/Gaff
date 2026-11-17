ALTER TABLE "organisations" ADD COLUMN "forwarding_works_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "forwarding_test_ref" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "forwarding_test_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "forwarding_test_arrived_at" timestamp with time zone;