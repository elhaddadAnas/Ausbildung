ALTER TABLE "User"
ADD COLUMN "unlimitedAccess" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User"
SET "unlimitedAccess" = true
WHERE LOWER("email") = 'zaydelhaddad123@gmail.com';
