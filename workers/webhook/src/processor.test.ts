import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "@ai-marketing-manager/config";
import {
  CLERK_WEBHOOK_EVENT_JOB_NAME,
  CLERK_RECONCILIATION_JOB_NAME,
} from "@ai-marketing-manager/queue";

const getPrismaClient = vi.fn();
vi.mock("@ai-marketing-manager/domain", () => ({ getPrismaClient }));

const applyWebhookEvent = vi.fn();
vi.mock("./apply-webhook-event.js", () => ({ applyWebhookEvent }));

const reconcileIdentity = vi.fn();
vi.mock("./reconcile.js", () => ({ reconcileIdentity }));

const { createWebhookProcessor } = await import("./processor.js");

const logger = createLogger({ serviceName: "test-processor", level: "silent" });

function fakeJob(name: string, data: unknown) {
  return { id: "job_1", name, data } as never;
}

describe("createWebhookProcessor — job-name dispatch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getPrismaClient.mockReturnValue({
      clerkWebhookEvent: { update: vi.fn().mockResolvedValue({}) },
    });
  });

  it("dispatches a clerk-webhook-event job to applyWebhookEvent and marks it PROCESSED", async () => {
    applyWebhookEvent.mockResolvedValueOnce({ outcome: "applied" });
    const prisma = getPrismaClient();

    const processor = createWebhookProcessor({ clerkClient: null, logger });
    const job = fakeJob(CLERK_WEBHOOK_EVENT_JOB_NAME, {
      eventId: "evt_1",
      eventType: "user.created",
      data: {},
    });

    const result = await processor(job, "token" as never);

    expect(applyWebhookEvent).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ eventId: "evt_1" }),
    );
    expect(prisma.clerkWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: "evt_1" },
      data: { status: "PROCESSED", processedAt: expect.any(Date) },
    });
    expect(result).toEqual({ outcome: "applied" });
  });

  it("dispatches a clerk-reconciliation job to reconcileIdentity when a Clerk client is configured", async () => {
    reconcileIdentity.mockResolvedValueOnce({ usersScanned: 3 });
    const clerkClient = {} as never;

    const processor = createWebhookProcessor({ clerkClient, logger });
    const job = fakeJob(CLERK_RECONCILIATION_JOB_NAME, {});

    const result = await processor(job, "token" as never);

    expect(reconcileIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ clerkClient, logger }),
    );
    expect(result).toEqual({ usersScanned: 3 });
  });

  it("skips reconciliation (never calls reconcileIdentity) when no Clerk client is configured", async () => {
    const processor = createWebhookProcessor({ clerkClient: null, logger });
    const job = fakeJob(CLERK_RECONCILIATION_JOB_NAME, {});

    const result = await processor(job, "token" as never);

    expect(reconcileIdentity).not.toHaveBeenCalled();
    expect(result).toEqual({ skipped: true });
  });

  it("throws on an unrecognized job name", async () => {
    const processor = createWebhookProcessor({ clerkClient: null, logger });
    const job = fakeJob("not-a-real-job", {});

    await expect(processor(job, "token" as never)).rejects.toThrow(/Unknown job name/);
  });
});
