CREATE TABLE "dev_objects" (
	"bucket" text NOT NULL,
	"key" text NOT NULL,
	"content_type" text NOT NULL,
	"body" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dev_objects_bucket_key_pk" PRIMARY KEY("bucket","key")
);
