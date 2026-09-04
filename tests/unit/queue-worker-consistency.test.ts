import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { QUEUE_NAMES } from "@ai-marketing-manager/queue";

const workersDir = fileURLToPath(new URL("../../workers", import.meta.url));

describe("queue name / worker directory consistency", () => {
  it("has exactly one workers/<name> directory per entry in QUEUE_NAMES", () => {
    const workerDirs = readdirSync(workersDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(workerDirs).toEqual([...QUEUE_NAMES].sort());
  });
});
