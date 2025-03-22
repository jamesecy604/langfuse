-- AlterTable
ALTER TABLE "UserApiKey" ADD COLUMN     "projectId" TEXT;

-- CreateIndex
CREATE INDEX "UserApiKey_projectId_idx" ON "UserApiKey"("projectId");

-- AddForeignKey
ALTER TABLE "UserApiKey" ADD CONSTRAINT "UserApiKey_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
