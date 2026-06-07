-- Gift Links (§1): a sender locks NGN into a shareable claim link. The money
-- lives in the `gift_unclaimed` LedgerAccount until claimed or refunded. No
-- backfill — the table starts empty.

-- AlterTable: funnel tag for users onboarded via a feature (e.g. gift claim).
ALTER TABLE "User" ADD COLUMN "acquiredVia" TEXT;

-- CreateTable
CREATE TABLE "Gift" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "asset" TEXT NOT NULL DEFAULT 'NGN',
    "amountMinor" BIGINT NOT NULL,
    "message" TEXT,
    "claimCode" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'UNCLAIMED',
    "claimedByUserId" TEXT,
    "ttlExpiresAt" TIMESTAMP(3) NOT NULL,
    "stateUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "Gift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Gift_claimCode_key" ON "Gift"("claimCode");

-- CreateIndex
CREATE INDEX "Gift_senderId_createdAt_idx" ON "Gift"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "Gift_state_ttlExpiresAt_idx" ON "Gift"("state", "ttlExpiresAt");

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
