CREATE TABLE "public_rate_limits" (
	"scope" varchar(16) NOT NULL,
	"table_id" uuid NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"request_count" integer NOT NULL,
	CONSTRAINT "public_rate_limits_scope_table_id_pk" PRIMARY KEY("scope","table_id"),
	CONSTRAINT "public_rate_limits_count_check" CHECK ("public_rate_limits"."request_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "public_rate_limits" ADD CONSTRAINT "public_rate_limits_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE cascade ON UPDATE no action;