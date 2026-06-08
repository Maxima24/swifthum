-- Optional email address per user, for emailed verifiable receipts. Nullable; no
-- backfill (users add it in Settings).

-- AlterTable
ALTER TABLE "User" ADD COLUMN "email" TEXT;
