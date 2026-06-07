-- Pay-by-username: store each user's lowercased Telegram @handle so others can
-- send NGN directly to them. Nullable + unique (Telegram handles are globally
-- unique; not every user has one). No backfill — captured lazily on next
-- Mini-App sign-in / bot interaction.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
