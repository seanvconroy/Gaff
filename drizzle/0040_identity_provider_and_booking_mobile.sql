ALTER TABLE "applications" ADD COLUMN "mobile_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "mobile_pending" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "mobile_code_hash" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "mobile_code_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "mobile_code_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "mobile_codes_today" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "mobile_code_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "checks" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "checks" ADD COLUMN "consent_version" text;--> statement-breakpoint
ALTER TABLE "checks" ADD COLUMN "redact_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "checks" ADD COLUMN "provider_redacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_checks" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_checks" ADD COLUMN "consent_version" text;--> statement-breakpoint
ALTER TABLE "identity_checks" ADD COLUMN "redact_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_checks" ADD COLUMN "provider_redacted_at" timestamp with time zone;