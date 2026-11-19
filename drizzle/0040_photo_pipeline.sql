ALTER TABLE "letting_photos" ADD COLUMN "kind" text DEFAULT 'photo' NOT NULL;--> statement-breakpoint
ALTER TABLE "letting_photos" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "letting_photos" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "letting_photos" ADD COLUMN "widths" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "letting_photos" ADD COLUMN "phash" bigint;--> statement-breakpoint
ALTER TABLE "letting_photos" ADD CONSTRAINT "letting_photos_kind" CHECK ("letting_photos"."kind" in ('photo', 'floor_plan'));