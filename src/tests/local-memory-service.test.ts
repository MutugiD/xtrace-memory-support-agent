import { describe, expect, test } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { LocalMemoryService } from "../memory/local-memory-service.js";

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xtrace-local-mem-"));
  return path.join(dir, "memory.sqlite");
}

describe("LocalMemoryService", () => {
  test("ingest creates facts and supersedes on contradiction", async () => {
    const dbPath = tempDbPath();
    const svc = new LocalMemoryService({ appId: "app_demo", dbPath });
    const userId = "u1";

    const w1 = await svc.ingestTurn({
      userId,
      convId: "c1",
      messages: [{ role: "user", content: "We are on the Pro plan. Prefer email. We use QuickBooks." }]
    });
    expect(w1.created.length).toBeGreaterThan(0);

    const w2 = await svc.ingestTurn({
      userId,
      convId: "c2",
      messages: [{ role: "user", content: "Actually we are on Enterprise and prefer Slack." }]
    });
    expect(Object.keys(w2.supersededBy).length).toBeGreaterThan(0);

    const timeline = await svc.buildTimeline({ userId });
    expect(timeline.some((e) => e.status === "superseded")).toBe(true);
    expect(timeline.some((e) => e.status === "active")).toBe(true);

    // Persistence check: new instance should see data
    const svc2 = new LocalMemoryService({ appId: "app_demo", dbPath });
    const facts = await svc2.listFacts({ userId, includeSuperseded: true });
    expect(facts.length).toBeGreaterThan(0);
  });

  test("ingest identical facts is a no-op", async () => {
    const svc = new LocalMemoryService({ appId: "app_demo", dbPath: tempDbPath() });
    const userId = "u2";
    await svc.ingestTurn({
      userId,
      convId: "c1",
      messages: [{ role: "user", content: "We are on the Pro plan. Prefer email." }]
    });
    const w2 = await svc.ingestTurn({
      userId,
      convId: "c2",
      messages: [{ role: "user", content: "We are on the Pro plan. Prefer email." }]
    });
    expect(w2.created.length).toBe(0);
    expect(Object.keys(w2.supersededBy).length).toBe(0);
  });

  test("retrieveContext returns contextPrompt and ranked active facts", async () => {
    const svc = new LocalMemoryService({ appId: "app_demo", dbPath: tempDbPath() });
    const userId = "u3";
    await svc.ingestTurn({
      userId,
      convId: "c1",
      messages: [{ role: "user", content: "We are on Enterprise. Prefer Slack. Invoice reconciliation is broken." }]
    });

    const ctx = await svc.retrieveContext({
      userId,
      convId: "c1",
      query: "help with invoice reconciliation"
    });

    expect(ctx.memories.length).toBeGreaterThan(0);
    expect(ctx.contextPrompt).toContain("Known customer context");
  });
});

