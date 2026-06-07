-- P2P Escrow (§3): two-party escrow with money held in the `escrow_hold` ledger
-- account until release/refund/resolution. creator=buyer/funder,
-- counterparty=seller/receiver (bound on join). No backfill — tables start empty.

-- CreateTable
CREATE TABLE "Escrow" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "counterpartyId" TEXT,
    "asset" TEXT NOT NULL DEFAULT 'NGN',
    "amountMinor" BIGINT NOT NULL,
    "terms" TEXT,
    "joinCode" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PROPOSED',
    "ttlExpiresAt" TIMESTAMP(3) NOT NULL,
    "stateUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Escrow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscrowEvent" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EscrowEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Escrow_joinCode_key" ON "Escrow"("joinCode");

-- CreateIndex
CREATE INDEX "Escrow_creatorId_createdAt_idx" ON "Escrow"("creatorId", "createdAt");

-- CreateIndex
CREATE INDEX "Escrow_counterpartyId_createdAt_idx" ON "Escrow"("counterpartyId", "createdAt");

-- CreateIndex
CREATE INDEX "Escrow_state_ttlExpiresAt_idx" ON "Escrow"("state", "ttlExpiresAt");

-- CreateIndex
CREATE INDEX "EscrowEvent_escrowId_createdAt_idx" ON "EscrowEvent"("escrowId", "createdAt");

-- AddForeignKey
ALTER TABLE "Escrow" ADD CONSTRAINT "Escrow_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escrow" ADD CONSTRAINT "Escrow_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowEvent" ADD CONSTRAINT "EscrowEvent_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "Escrow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
