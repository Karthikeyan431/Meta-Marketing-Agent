import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClerkWebhookEventPayload } from "@ai-marketing-manager/queue";

const syncUserCreatedOrUpdated = vi.fn();
const syncUserDeleted = vi.fn();
const syncOrganizationCreated = vi.fn();
const syncOrganizationUpdated = vi.fn();
const syncOrganizationDeleted = vi.fn();
const syncMembershipUpsert = vi.fn();
const syncMembershipRemoved = vi.fn();

vi.mock("@ai-marketing-manager/domain", () => ({
  syncUserCreatedOrUpdated,
  syncUserDeleted,
  syncOrganizationCreated,
  syncOrganizationUpdated,
  syncOrganizationDeleted,
  syncMembershipUpsert,
  syncMembershipRemoved,
}));

const { applyWebhookEvent } = await import("./apply-webhook-event.js");

const fakePrisma = {} as never;

function payload(eventType: string, data: unknown): ClerkWebhookEventPayload {
  return { eventId: "evt_1", eventType, data, correlationId: "corr_1" };
}

describe("applyWebhookEvent (identity-sync.md §1 event table)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("user.created maps to syncUserCreatedOrUpdated with primary email + full name", async () => {
    await applyWebhookEvent(
      fakePrisma,
      payload("user.created", {
        id: "user_1",
        primary_email_address_id: "email_1",
        email_addresses: [{ id: "email_1", email_address: "a@example.com" }],
        first_name: "Ada",
        last_name: "Lovelace",
        username: null,
        updated_at: 1_700_000_000_000,
      }),
    );

    expect(syncUserCreatedOrUpdated).toHaveBeenCalledWith(fakePrisma, {
      clerkUserId: "user_1",
      email: "a@example.com",
      displayName: "Ada Lovelace",
      updatedAt: new Date(1_700_000_000_000),
    });
  });

  it("user.created falls back to username when no first/last name is set", async () => {
    await applyWebhookEvent(
      fakePrisma,
      payload("user.created", {
        id: "user_2",
        primary_email_address_id: null,
        email_addresses: [],
        first_name: null,
        last_name: null,
        username: "adalovelace",
        updated_at: 1_700_000_000_000,
      }),
    );

    expect(syncUserCreatedOrUpdated).toHaveBeenCalledWith(
      fakePrisma,
      expect.objectContaining({ email: null, displayName: "adalovelace" }),
    );
  });

  it("user.deleted maps to syncUserDeleted", async () => {
    await applyWebhookEvent(fakePrisma, payload("user.deleted", { id: "user_3", deleted: true }));
    expect(syncUserDeleted).toHaveBeenCalledWith(fakePrisma, { clerkUserId: "user_3" });
  });

  it("user.deleted with no id is ignored, not applied", async () => {
    const result = await applyWebhookEvent(fakePrisma, payload("user.deleted", { deleted: true }));
    expect(result.outcome).toBe("ignored");
    expect(syncUserDeleted).not.toHaveBeenCalled();
  });

  it("organization.created maps created_by through as ownerClerkUserId", async () => {
    await applyWebhookEvent(
      fakePrisma,
      payload("organization.created", {
        id: "org_1",
        name: "Acme",
        created_by: "user_creator",
        updated_at: 1_700_000_000_000,
      }),
    );

    expect(syncOrganizationCreated).toHaveBeenCalledWith(fakePrisma, {
      clerkOrganizationId: "org_1",
      name: "Acme",
      createdByClerkUserId: "user_creator",
      updatedAt: new Date(1_700_000_000_000),
      correlationId: "corr_1",
    });
  });

  it("organization.deleted with no id is ignored", async () => {
    const result = await applyWebhookEvent(fakePrisma, payload("organization.deleted", {}));
    expect(result.outcome).toBe("ignored");
    expect(syncOrganizationDeleted).not.toHaveBeenCalled();
  });

  it("organizationMembership.created maps organization.id and public_user_data.user_id", async () => {
    await applyWebhookEvent(
      fakePrisma,
      payload("organizationMembership.created", {
        organization: { id: "org_1" },
        public_user_data: { user_id: "user_5" },
        updated_at: 1_700_000_000_000,
      }),
    );

    expect(syncMembershipUpsert).toHaveBeenCalledWith(fakePrisma, {
      clerkOrganizationId: "org_1",
      clerkUserId: "user_5",
      updatedAt: new Date(1_700_000_000_000),
    });
  });

  it("organizationMembership.updated is dispatched identically to .created", async () => {
    await applyWebhookEvent(
      fakePrisma,
      payload("organizationMembership.updated", {
        organization: { id: "org_2" },
        public_user_data: { user_id: "user_6" },
        updated_at: 1_700_000_000_000,
      }),
    );
    expect(syncMembershipUpsert).toHaveBeenCalledWith(
      fakePrisma,
      expect.objectContaining({ clerkOrganizationId: "org_2", clerkUserId: "user_6" }),
    );
  });

  it("organizationMembership.deleted maps to syncMembershipRemoved", async () => {
    await applyWebhookEvent(
      fakePrisma,
      payload("organizationMembership.deleted", {
        organization: { id: "org_3" },
        public_user_data: { user_id: "user_7" },
        updated_at: 1_700_000_000_000,
      }),
    );
    expect(syncMembershipRemoved).toHaveBeenCalledWith(fakePrisma, {
      clerkOrganizationId: "org_3",
      clerkUserId: "user_7",
      updatedAt: new Date(1_700_000_000_000),
      correlationId: "corr_1",
    });
  });

  it("an unhandled event type (e.g. session.*, organizationInvitation.*) is ignored, not an error", async () => {
    const result = await applyWebhookEvent(fakePrisma, payload("session.created", {}));
    expect(result.outcome).toBe("ignored");
  });
});
