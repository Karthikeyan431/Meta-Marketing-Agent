-- CreateEnum
CREATE TYPE "SyncedResourceLifecycleStatus" AS ENUM ('ACTIVE', 'EXTERNALLY_REMOVED');

-- CreateEnum
CREATE TYPE "SyncTriggerType" AS ENUM ('MANUAL', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "SyncRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL');

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "ad_account_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "effective_status" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "daily_budget" BIGINT,
    "lifetime_budget" BIGINT,
    "budget_remaining" BIGINT,
    "start_time" TIMESTAMP(3),
    "stop_time" TIMESTAMP(3),
    "source_updated_at" TIMESTAMP(3),
    "lifecycle_status" "SyncedResourceLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_sets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "effective_status" TEXT NOT NULL,
    "optimization_goal" TEXT,
    "billing_event" TEXT,
    "bid_strategy" TEXT,
    "daily_budget" BIGINT,
    "lifetime_budget" BIGINT,
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "source_updated_at" TIMESTAMP(3),
    "lifecycle_status" "SyncedResourceLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "ad_set_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "effective_status" TEXT NOT NULL,
    "creative_external_id" TEXT,
    "creative_name" TEXT,
    "source_updated_at" TIMESTAMP(3),
    "lifecycle_status" "SyncedResourceLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_sync_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "ad_account_id" UUID NOT NULL,
    "trigger_type" "SyncTriggerType" NOT NULL,
    "status" "SyncRunStatus" NOT NULL DEFAULT 'RUNNING',
    "campaigns_synced" INTEGER NOT NULL DEFAULT 0,
    "ad_sets_synced" INTEGER NOT NULL DEFAULT 0,
    "ads_synced" INTEGER NOT NULL DEFAULT 0,
    "items_failed" INTEGER NOT NULL DEFAULT 0,
    "error_summary" TEXT,
    "correlation_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "meta_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_workspace_id_lifecycle_status_idx" ON "campaigns"("workspace_id", "lifecycle_status");

-- CreateIndex
CREATE INDEX "campaigns_ad_account_id_idx" ON "campaigns"("ad_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_workspace_id_external_id_key" ON "campaigns"("workspace_id", "external_id");

-- CreateIndex
CREATE INDEX "ad_sets_workspace_id_lifecycle_status_idx" ON "ad_sets"("workspace_id", "lifecycle_status");

-- CreateIndex
CREATE INDEX "ad_sets_campaign_id_idx" ON "ad_sets"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "ad_sets_workspace_id_external_id_key" ON "ad_sets"("workspace_id", "external_id");

-- CreateIndex
CREATE INDEX "ads_workspace_id_lifecycle_status_idx" ON "ads"("workspace_id", "lifecycle_status");

-- CreateIndex
CREATE INDEX "ads_ad_set_id_idx" ON "ads"("ad_set_id");

-- CreateIndex
CREATE UNIQUE INDEX "ads_workspace_id_external_id_key" ON "ads"("workspace_id", "external_id");

-- CreateIndex
CREATE INDEX "meta_sync_runs_workspace_id_started_at_idx" ON "meta_sync_runs"("workspace_id", "started_at");

-- CreateIndex
CREATE INDEX "meta_sync_runs_ad_account_id_started_at_idx" ON "meta_sync_runs"("ad_account_id", "started_at");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_sets" ADD CONSTRAINT "ad_sets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_sets" ADD CONSTRAINT "ad_sets_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads" ADD CONSTRAINT "ads_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads" ADD CONSTRAINT "ads_ad_set_id_fkey" FOREIGN KEY ("ad_set_id") REFERENCES "ad_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_sync_runs" ADD CONSTRAINT "meta_sync_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_sync_runs" ADD CONSTRAINT "meta_sync_runs_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
