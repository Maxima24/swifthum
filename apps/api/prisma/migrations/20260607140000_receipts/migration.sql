-- Verifiable Receipts (§2): a signed, shareable proof emitted on every completed
-- money movement (payment redeem, gift claim, later escrow release). No backfill
-- — the table starts empty and fills as new movements complete.

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "toName" TEXT NOT NULL,
    "asset" TEXT NOT NULL DEFAULT 'NGN',
    "amountMinor" BIGINT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Receipt_sourceType_sourceId_idx" ON "Receipt"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "Receipt_toUserId_createdAt_idx" ON "Receipt"("toUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Receipt_fromUserId_createdAt_idx" ON "Receipt"("fromUserId", "createdAt");
