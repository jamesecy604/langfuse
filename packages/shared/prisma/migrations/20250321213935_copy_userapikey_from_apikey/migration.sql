/*
  Warnings:

  - You are about to drop the column `allowedIps` on the `UserApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `UserApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `createdById` on the `UserApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `UserApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `encryptedKey` on the `UserApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `expiresAt` on the `UserApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `hashedKey` on the `UserApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `lastUsedAt` on the `UserApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `UserApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `projectId` on the `UserApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `revoked` on the `UserApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `scopes` on the `UserApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `UserApiKey` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[id]` on the table `UserApiKey` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[public_key]` on the table `UserApiKey` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[hashed_secret_key]` on the table `UserApiKey` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[fast_hashed_secret_key]` on the table `UserApiKey` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `display_secret_key` to the `UserApiKey` table without a default value. This is not possible if the table is not empty.
  - Added the required column `hashed_secret_key` to the `UserApiKey` table without a default value. This is not possible if the table is not empty.
  - Added the required column `project_id` to the `UserApiKey` table without a default value. This is not possible if the table is not empty.
  - Added the required column `public_key` to the `UserApiKey` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "UserApiKey" DROP CONSTRAINT "UserApiKey_projectId_fkey";

-- DropIndex
DROP INDEX "UserApiKey_createdById_idx";

-- DropIndex
DROP INDEX "UserApiKey_hashedKey_key";

-- DropIndex
DROP INDEX "UserApiKey_projectId_idx";

-- DropIndex
DROP INDEX "UserApiKey_userId_idx";

-- AlterTable
ALTER TABLE "UserApiKey" DROP COLUMN "allowedIps",
DROP COLUMN "createdAt",
DROP COLUMN "createdById",
DROP COLUMN "description",
DROP COLUMN "encryptedKey",
DROP COLUMN "expiresAt",
DROP COLUMN "hashedKey",
DROP COLUMN "lastUsedAt",
DROP COLUMN "name",
DROP COLUMN "projectId",
DROP COLUMN "revoked",
DROP COLUMN "scopes",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "display_secret_key" TEXT NOT NULL,
ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "fast_hashed_secret_key" TEXT,
ADD COLUMN     "hashed_secret_key" TEXT NOT NULL,
ADD COLUMN     "last_used_at" TIMESTAMP(3),
ADD COLUMN     "note" TEXT,
ADD COLUMN     "project_id" TEXT NOT NULL,
ADD COLUMN     "public_key" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "UserApiKey_id_key" ON "UserApiKey"("id");

-- CreateIndex
CREATE UNIQUE INDEX "UserApiKey_public_key_key" ON "UserApiKey"("public_key");

-- CreateIndex
CREATE UNIQUE INDEX "UserApiKey_hashed_secret_key_key" ON "UserApiKey"("hashed_secret_key");

-- CreateIndex
CREATE UNIQUE INDEX "UserApiKey_fast_hashed_secret_key_key" ON "UserApiKey"("fast_hashed_secret_key");

-- CreateIndex
CREATE INDEX "UserApiKey_project_id_idx" ON "UserApiKey"("project_id");

-- CreateIndex
CREATE INDEX "UserApiKey_public_key_idx" ON "UserApiKey"("public_key");

-- CreateIndex
CREATE INDEX "UserApiKey_hashed_secret_key_idx" ON "UserApiKey"("hashed_secret_key");

-- CreateIndex
CREATE INDEX "UserApiKey_fast_hashed_secret_key_idx" ON "UserApiKey"("fast_hashed_secret_key");

-- AddForeignKey
ALTER TABLE "UserApiKey" ADD CONSTRAINT "UserApiKey_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
