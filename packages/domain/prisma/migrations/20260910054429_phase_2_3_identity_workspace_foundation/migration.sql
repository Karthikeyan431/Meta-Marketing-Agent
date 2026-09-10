-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'ANALYST', 'VIEWER');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM', 'WEBHOOK', 'RECONCILIATION');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "email" TEXT,
    "display_name" TEXT,
    "deleted_at" TIMESTAMP(3),
    "clerk_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_organization_id" TEXT,
    "name" TEXT NOT NULL,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "timezone" TEXT,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "clerk_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "clerk_synced_at" TIMESTAMP(3),
    "removed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "resource_group" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role" "Role" NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_permission_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "membership_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_permission_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID,
    "actor_type" "AuditActorType" NOT NULL,
    "actor_id" TEXT,
    "eventType" TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "action" TEXT NOT NULL,
    "outcome" "AuditOutcome" NOT NULL,
    "correlation_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clerk_webhook_events" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "failure_note" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "clerk_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_clerk_user_id_key" ON "users"("clerk_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_clerk_organization_id_key" ON "workspaces"("clerk_organization_id");

-- CreateIndex
CREATE INDEX "workspace_memberships_user_id_idx" ON "workspace_memberships"("user_id");

-- CreateIndex
CREATE INDEX "workspace_memberships_workspace_id_status_idx" ON "workspace_memberships"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_memberships_workspace_id_user_id_key" ON "workspace_memberships"("workspace_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_permission_id_key" ON "role_permissions"("role", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_permission_overrides_membership_id_permission_id_key" ON "membership_permission_overrides"("membership_id", "permission_id");

-- CreateIndex
CREATE INDEX "audit_events_workspace_id_created_at_idx" ON "audit_events"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_eventType_idx" ON "audit_events"("eventType");

-- AddForeignKey
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_permission_overrides" ADD CONSTRAINT "membership_permission_overrides_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "workspace_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_permission_overrides" ADD CONSTRAINT "membership_permission_overrides_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
