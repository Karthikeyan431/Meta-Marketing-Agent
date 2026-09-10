-- CreateEnum
CREATE TYPE "AdAccountSelectionStatus" AS ENUM ('ACTIVE', 'DESELECTED');

-- CreateTable
CREATE TABLE "ad_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "meta_connection_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "account_status" TEXT NOT NULL,
    "business_external_id" TEXT,
    "business_name" TEXT,
    "status" "AdAccountSelectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "selected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deselected_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ad_accounts_workspace_id_status_idx" ON "ad_accounts"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "ad_accounts_meta_connection_id_idx" ON "ad_accounts"("meta_connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "ad_accounts_workspace_id_external_id_key" ON "ad_accounts"("workspace_id", "external_id");

-- AddForeignKey
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_meta_connection_id_fkey" FOREIGN KEY ("meta_connection_id") REFERENCES "meta_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
