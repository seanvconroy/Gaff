ALTER TABLE "lettings" ADD COLUMN "criteria" jsonb;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "criteria_set_at" timestamp with time zone;