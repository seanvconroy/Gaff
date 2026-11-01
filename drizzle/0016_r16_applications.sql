ALTER TYPE "public"."application_status" ADD VALUE 'applied';--> statement-breakpoint
ALTER TYPE "public"."application_status" ADD VALUE 'preferred';--> statement-breakpoint
ALTER TYPE "public"."application_status" ADD VALUE 'backup';--> statement-breakpoint
ALTER TYPE "public"."application_status" ADD VALUE 'offered';--> statement-breakpoint
ALTER TYPE "public"."application_status" ADD VALUE 'accepted';--> statement-breakpoint
ALTER TYPE "public"."application_status" ADD VALUE 'declined';--> statement-breakpoint
ALTER TYPE "public"."application_status" ADD VALUE 'not_chosen';--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "earning" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "monthly_income_cents" integer;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "applied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "income_rule_tenths" integer DEFAULT 25 NOT NULL;