ALTER TABLE "lettings" ADD COLUMN "public_ref" text DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) NOT NULL;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "let_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "page_removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lettings" ADD CONSTRAINT "lettings_publicRef_unique" UNIQUE("public_ref");--> statement-breakpoint
-- UX-LS-10: homes let before this migration count from when they were closed, or last changed.
UPDATE "lettings" SET "let_at" = coalesce("closed_at", "updated_at") WHERE "status" = 'let';