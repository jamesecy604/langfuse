/*
  Warnings:

  - A unique constraint covering the columns `[display_secret_key]` on the table `llm_api_keys` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "llm_api_keys_display_secret_key_key" ON "llm_api_keys"("display_secret_key");
