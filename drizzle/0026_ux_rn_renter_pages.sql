ALTER TABLE "inventory_items" ADD COLUMN "tenant_note" text;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "tenant_noted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenancies" ADD COLUMN "ppsn_skipped_at" timestamp with time zone;