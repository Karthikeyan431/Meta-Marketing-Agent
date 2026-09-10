import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  getPrismaClient,
  provisionUser,
  softDeleteUser,
  syncUserProfile,
} from "@ai-marketing-manager/domain";

const prisma = getPrismaClient();
const createdClerkUserIds: string[] = [];

function testClerkUserId(): string {
  const id = `test_user_${randomUUID()}`;
  createdClerkUserIds.push(id);
  return id;
}

describe("identity user provisioning (Phase 2.3 Step 3)", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { clerkUserId: { in: createdClerkUserIds } } });
  });

  it("provisions a new application user on first contact", async () => {
    const clerkUserId = testClerkUserId();
    const user = await provisionUser(prisma, { clerkUserId });

    expect(user.clerkUserId).toBe(clerkUserId);
    expect(user.id).toBeTruthy();
    expect(user.deletedAt).toBeNull();
  });

  it("repeated provisioning for the same clerkUserId is idempotent (same row returned)", async () => {
    const clerkUserId = testClerkUserId();
    const first = await provisionUser(prisma, { clerkUserId });
    const second = await provisionUser(prisma, { clerkUserId });
    const third = await provisionUser(prisma, { clerkUserId });

    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);

    const rowCount = await prisma.user.count({ where: { clerkUserId } });
    expect(rowCount).toBe(1);
  });

  it("concurrent first-time provisioning cannot create duplicate users (unique constraint is the final protection)", async () => {
    const clerkUserId = testClerkUserId();

    const results = await Promise.all(
      Array.from({ length: 10 }, () => provisionUser(prisma, { clerkUserId })),
    );

    const uniqueIds = new Set(results.map((u) => u.id));
    expect(uniqueIds.size).toBe(1);

    const rowCount = await prisma.user.count({ where: { clerkUserId } });
    expect(rowCount).toBe(1);
  });

  it("never trusts a client-supplied application user ID — provisionUser only ever accepts a clerkUserId", async () => {
    const clerkUserId = testClerkUserId();
    const user = await provisionUser(prisma, { clerkUserId });
    // The function signature itself has no id/userId input parameter — this assertion
    // documents the guarantee structurally: the returned id is always DB-generated.
    expect(user.id).not.toBe(clerkUserId);
  });

  describe("user.updated / user.deleted sync", () => {
    it("syncUserProfile mirrors profile fields and is timestamp-guarded against out-of-order events", async () => {
      const clerkUserId = testClerkUserId();
      const t1 = new Date("2026-01-01T00:00:00Z");
      const t0 = new Date("2025-12-31T00:00:00Z");

      const created = await syncUserProfile(prisma, {
        clerkUserId,
        email: "newer@example.com",
        displayName: "Newer Name",
        syncedAt: t1,
      });
      expect(created.email).toBe("newer@example.com");

      // An older event arriving after a newer one is a no-op (identity-sync.md §3).
      const afterStaleEvent = await syncUserProfile(prisma, {
        clerkUserId,
        email: "older@example.com",
        displayName: "Older Name",
        syncedAt: t0,
      });
      expect(afterStaleEvent.email).toBe("newer@example.com");
    });

    it("softDeleteUser anonymizes profile fields but retains the row and its id", async () => {
      const clerkUserId = testClerkUserId();
      const user = await provisionUser(prisma, { clerkUserId });
      await syncUserProfile(prisma, {
        clerkUserId,
        email: "person@example.com",
        displayName: "A Person",
        syncedAt: new Date(),
      });

      const deleted = await softDeleteUser(prisma, clerkUserId);

      expect(deleted?.id).toBe(user.id);
      expect(deleted?.email).toBeNull();
      expect(deleted?.displayName).toBeNull();
      expect(deleted?.deletedAt).not.toBeNull();

      const stillFindable = await prisma.user.findUnique({ where: { clerkUserId } });
      expect(stillFindable).not.toBeNull();
    });
  });
});
