import { describe, expect, it, vi } from "vitest";
import pino from "pino";
import { runShutdownHandlers } from "./shutdown.js";

const silentLogger = pino({ level: "silent" });

describe("runShutdownHandlers", () => {
  it("runs every handler and reports success when all resolve", async () => {
    const handlerA = vi.fn().mockResolvedValue(undefined);
    const handlerB = vi.fn().mockResolvedValue(undefined);

    const result = await runShutdownHandlers({
      logger: silentLogger,
      handlers: [handlerA, handlerB],
    });

    expect(result).toEqual({ ok: true, timedOut: false, failureCount: 0 });
    expect(handlerA).toHaveBeenCalledOnce();
    expect(handlerB).toHaveBeenCalledOnce();
  });

  it("runs handlers concurrently, not sequentially", async () => {
    const order: string[] = [];
    const slow = async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push("slow");
    };
    const fast = async () => {
      order.push("fast");
    };

    await runShutdownHandlers({ logger: silentLogger, handlers: [slow, fast] });
    expect(order).toEqual(["fast", "slow"]);
  });

  it("reports failure but still runs all handlers when one rejects", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("boom"));
    const succeeding = vi.fn().mockResolvedValue(undefined);

    const result = await runShutdownHandlers({
      logger: silentLogger,
      handlers: [failing, succeeding],
    });

    expect(result.ok).toBe(false);
    expect(result.failureCount).toBe(1);
    expect(succeeding).toHaveBeenCalledOnce();
  });

  it("reports timedOut and does not hang when a handler never resolves", async () => {
    const hangingHandler = () => new Promise<void>(() => {});

    const result = await runShutdownHandlers({
      logger: silentLogger,
      handlers: [hangingHandler],
      timeoutMs: 25,
    });

    expect(result).toEqual({ ok: false, timedOut: true, failureCount: 1 });
  });
});
