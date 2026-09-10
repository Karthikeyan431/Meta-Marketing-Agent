import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "@ai-marketing-manager/config";

const findWorkspaceByClerkOrgId = vi.fn();
const syncWorkspaceProfile = vi.fn();
const syncOrganizationCreated = vi.fn();
const syncUserCreatedOrUpdated = vi.fn();
const syncMembershipUpsert = vi.fn();
const removeMembershipFromSync = vi.fn();
const listActiveMembershipsForWorkspace = vi.fn();
const recordAuditEvent = vi.fn();

class FakeDeferredSyncError extends Error {}

vi.mock("@ai-marketing-manager/domain", () => ({
  findWorkspaceByClerkOrgId,
  syncWorkspaceProfile,
  syncOrganizationCreated,
  syncUserCreatedOrUpdated,
  syncMembershipUpsert,
  removeMembershipFromSync,
  listActiveMembershipsForWorkspace,
  recordAuditEvent,
  DeferredSyncError: FakeDeferredSyncError,
}));

const { reconcileIdentity } = await import("./reconcile.js");

const logger = createLogger({ serviceName: "test-reconcile", level: "silent" });
const fakePrisma = {} as never;

function paginated<T>(items: T[]) {
  return vi.fn().mockResolvedValue({ data: items, totalCount: items.length });
}

function emptyPage() {
  return vi.fn().mockResolvedValue({ data: [], totalCount: 0 });
}

describe("reconcileIdentity (identity-sync.md §4, ADR-021)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("syncs every user via the paginated user list", async () => {
    const clerkClient = {
      users: {
        getUserList: paginated([
          {
            id: "user_1",
            emailAddresses: [{ id: "e1", emailAddress: "a@example.com" }],
            primaryEmailAddressId: "e1",
            firstName: "Ada",
            lastName: "Lovelace",
            username: null,
            updatedAt: 1_700_000_000_000,
          },
        ]),
      },
      organizations: {
        getOrganizationList: emptyPage(),
        getOrganizationMembershipList: emptyPage(),
      },
    } as never;

    const summary = await reconcileIdentity({ prisma: fakePrisma, clerkClient, logger });

    expect(summary.usersScanned).toBe(1);
    expect(syncUserCreatedOrUpdated).toHaveBeenCalledWith(fakePrisma, {
      clerkUserId: "user_1",
      email: "a@example.com",
      displayName: "Ada Lovelace",
      updatedAt: new Date(1_700_000_000_000),
    });
  });

  it("updates an existing workspace's profile and upserts its current members", async () => {
    findWorkspaceByClerkOrgId.mockResolvedValueOnce({
      id: "workspace_1",
      clerkOrganizationId: "org_1",
    });
    syncWorkspaceProfile.mockResolvedValueOnce({ id: "workspace_1" });
    listActiveMembershipsForWorkspace.mockResolvedValueOnce([
      { userId: "local_user_1", user: { clerkUserId: "user_member" } },
    ]);

    const clerkClient = {
      users: { getUserList: emptyPage() },
      organizations: {
        getOrganizationList: paginated([
          { id: "org_1", name: "Acme", createdBy: "user_creator", updatedAt: 1_700_000_000_000 },
        ]),
        getOrganizationMembershipList: paginated([
          {
            organization: { id: "org_1" },
            publicUserData: { userId: "user_member" },
            updatedAt: 1_700_000_000_000,
          },
        ]),
      },
    } as never;

    const summary = await reconcileIdentity({ prisma: fakePrisma, clerkClient, logger });

    expect(summary.workspacesUpdated).toBe(1);
    expect(syncWorkspaceProfile).toHaveBeenCalledWith(fakePrisma, {
      clerkOrganizationId: "org_1",
      name: "Acme",
      syncedAt: new Date(1_700_000_000_000),
    });
    expect(summary.membershipsUpserted).toBe(1);
    expect(summary.membershipsRemoved).toBe(0); // the one Clerk-reported member matches local
  });

  it("creates a workspace (with owner) when discovered with a created_by and no local row", async () => {
    findWorkspaceByClerkOrgId.mockResolvedValueOnce(null);
    syncOrganizationCreated.mockResolvedValueOnce({
      workspace: { id: "workspace_new" },
      created: true,
    });
    listActiveMembershipsForWorkspace.mockResolvedValueOnce([]);

    const clerkClient = {
      users: { getUserList: emptyPage() },
      organizations: {
        getOrganizationList: paginated([
          {
            id: "org_new",
            name: "New Co",
            createdBy: "user_creator",
            updatedAt: 1_700_000_000_000,
          },
        ]),
        getOrganizationMembershipList: emptyPage(),
      },
    } as never;

    const summary = await reconcileIdentity({ prisma: fakePrisma, clerkClient, logger });

    expect(summary.workspacesCreated).toBe(1);
    expect(syncOrganizationCreated).toHaveBeenCalledWith(
      fakePrisma,
      expect.objectContaining({
        clerkOrganizationId: "org_new",
        createdByClerkUserId: "user_creator",
      }),
    );
  });

  it("never creates a workspace with no resolvable owner — flags a discrepancy instead", async () => {
    findWorkspaceByClerkOrgId.mockResolvedValueOnce(null);

    const clerkClient = {
      users: { getUserList: emptyPage() },
      organizations: {
        getOrganizationList: paginated([
          {
            id: "org_orphan",
            name: "Orphan Co",
            createdBy: undefined,
            updatedAt: 1_700_000_000_000,
          },
        ]),
        getOrganizationMembershipList: emptyPage(),
      },
    } as never;

    const summary = await reconcileIdentity({ prisma: fakePrisma, clerkClient, logger });

    expect(syncOrganizationCreated).not.toHaveBeenCalled();
    expect(summary.discrepancies).toBe(1);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      fakePrisma,
      expect.objectContaining({
        eventType: "workspace.reconciliation_skipped",
        outcome: "FAILURE",
      }),
    );
  });

  it("removes a local membership no longer present in Clerk's current membership list (true-up)", async () => {
    findWorkspaceByClerkOrgId.mockResolvedValueOnce({
      id: "workspace_1",
      clerkOrganizationId: "org_1",
    });
    syncWorkspaceProfile.mockResolvedValueOnce({ id: "workspace_1" });
    listActiveMembershipsForWorkspace.mockResolvedValueOnce([
      { userId: "local_user_gone", user: { clerkUserId: "user_gone" } },
    ]);

    const clerkClient = {
      users: { getUserList: emptyPage() },
      organizations: {
        getOrganizationList: paginated([
          { id: "org_1", name: "Acme", createdBy: "user_creator", updatedAt: 1_700_000_000_000 },
        ]),
        getOrganizationMembershipList: emptyPage(), // Clerk reports nobody currently
      },
    } as never;

    const summary = await reconcileIdentity({ prisma: fakePrisma, clerkClient, logger });

    expect(summary.membershipsRemoved).toBe(1);
    expect(removeMembershipFromSync).toHaveBeenCalledWith(
      fakePrisma,
      expect.objectContaining({ workspaceId: "workspace_1", userId: "local_user_gone" }),
    );
  });

  it("a deferred membership sync (missing local user parent) is counted as a discrepancy, not a thrown failure", async () => {
    findWorkspaceByClerkOrgId.mockResolvedValueOnce({
      id: "workspace_1",
      clerkOrganizationId: "org_1",
    });
    syncWorkspaceProfile.mockResolvedValueOnce({ id: "workspace_1" });
    listActiveMembershipsForWorkspace.mockResolvedValueOnce([]);
    syncMembershipUpsert.mockRejectedValueOnce(new FakeDeferredSyncError("parent missing"));

    const clerkClient = {
      users: { getUserList: emptyPage() },
      organizations: {
        getOrganizationList: paginated([
          { id: "org_1", name: "Acme", createdBy: "user_creator", updatedAt: 1_700_000_000_000 },
        ]),
        getOrganizationMembershipList: paginated([
          { organization: { id: "org_1" }, publicUserData: { userId: "user_x" }, updatedAt: 1 },
        ]),
      },
    } as never;

    const summary = await reconcileIdentity({ prisma: fakePrisma, clerkClient, logger });

    expect(summary.discrepancies).toBeGreaterThanOrEqual(1);
    expect(summary.membershipsUpserted).toBe(0);
  });
});
