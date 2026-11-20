CREATE TABLE "auth_limits" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"hits" integer NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "sign_in_method" text;--> statement-breakpoint
CREATE INDEX "auth_limits_window_idx" ON "auth_limits" USING btree ("window_started_at");