ALTER TABLE "dining_tables" DROP CONSTRAINT "dining_tables_table_number_unique";--> statement-breakpoint
ALTER TABLE "dining_tables" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "dining_tables_live_number_uniq" ON "dining_tables" USING btree ("table_number") WHERE "dining_tables"."deleted_at" IS NULL;