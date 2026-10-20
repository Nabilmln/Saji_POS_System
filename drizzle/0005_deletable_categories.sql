DROP INDEX "categories_name_lower_uniq";--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_lower_uniq" ON "categories" USING btree (lower("name")) WHERE "categories"."deleted_at" IS NULL;