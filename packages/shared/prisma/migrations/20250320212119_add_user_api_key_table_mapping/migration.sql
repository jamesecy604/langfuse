-- CreateTable
CREATE TABLE "public.UserApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "userId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "encryptedKey" TEXT,
    "scopes" TEXT[],
    "allowedIps" TEXT[],
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "public.UserApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "public.UserApiKey_hashedKey_key" ON "public.UserApiKey"("hashedKey");

-- CreateIndex
CREATE INDEX "public.UserApiKey_userId_idx" ON "public.UserApiKey"("userId");

-- CreateIndex
CREATE INDEX "public.UserApiKey_createdById_idx" ON "public.UserApiKey"("createdById");

-- AddForeignKey
ALTER TABLE "public.UserApiKey" ADD CONSTRAINT "public.UserApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "prompt_dependencies_project_id_child_name" RENAME TO "prompt_dependencies_project_id_child_name_idx";

-- RenameIndex
ALTER INDEX "prompt_dependencies_project_id_parent_id" RENAME TO "prompt_dependencies_project_id_parent_id_idx";
