-- Track whether a receipt has been emailed (auto on transaction success, or via
-- the manual "Email receipt" button) — drives the "Emailed ✓" UI status. No backfill.

-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN "emailedAt" TIMESTAMP(3);
