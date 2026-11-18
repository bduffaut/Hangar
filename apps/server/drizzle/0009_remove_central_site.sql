-- One Hangar per person (D40): no central site, no connected servers, no open sign-up.
-- Accounts made through open sign-up could only use servers of their own, never this machine;
-- without the flag that kept them off it they would get in, so they go. They own no projects here.
DELETE FROM "users" WHERE "local_access" = false;--> statement-breakpoint
DROP TABLE "servers" CASCADE;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "local_access";--> statement-breakpoint
DELETE FROM "settings" WHERE "key" IN ('openSignUp', 'central', 'exposeTowerPublicly');
