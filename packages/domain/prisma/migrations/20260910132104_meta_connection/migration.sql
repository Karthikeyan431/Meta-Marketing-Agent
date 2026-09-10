-- CreateEnum
CREATE TYPE "MetaConnectionStatus" AS ENUM ('CONNECTED', 'DEGRADED', 'REAUTH_REQUIRED', 'DISCONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "meta_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'meta',
    "external_user_id" TEXT NOT NULL,
    "credential_ciphertext" BYTEA,
    "credential_iv" BYTEA,
    "credential_auth_tag" BYTEA,
    "scopes" TEXT[],
    "token_expires_at" TIMESTAMP(3),
    "status" "MetaConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "last_validated_at" TIMESTAMP(3),
    "last_successful_api_call_at" TIMESTAMP(3),
    "error_state" TEXT,
    "connection_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "disconnected_at" TIMESTAMP(3),

    CONSTRAINT "meta_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meta_connections_workspace_id_key" ON "meta_connections"("workspace_id");

-- AddForeignKey
ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
