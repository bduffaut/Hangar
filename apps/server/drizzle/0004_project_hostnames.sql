ALTER TABLE "projects" ADD COLUMN "hostnames" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
-- The one public domain becomes a list of domains, and each project's automatic
-- name.<domain> address (plus any custom domains) becomes an explicit address it keeps.
INSERT INTO "settings" ("key", "value")
SELECT 'publicDomains', CASE WHEN jsonb_typeof("value") = 'string' THEN jsonb_build_array("value") ELSE '[]'::jsonb END
FROM "settings" WHERE "key" = 'publicDomain'
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
UPDATE "projects" SET "hostnames" = ARRAY["name" || '.' || (SELECT "value" #>> '{}' FROM "settings" WHERE "key" = 'publicDomain')] || "domains"
WHERE EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'publicDomain' AND jsonb_typeof("value") = 'string');--> statement-breakpoint
UPDATE "projects" SET "hostnames" = "domains" WHERE "hostnames" = '{}' AND "domains" <> '{}';--> statement-breakpoint
DELETE FROM "settings" WHERE "key" = 'publicDomain';
