import { describe, expect, test } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { buildApp } from "../app.js";

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xtrace-local-api-"));
  return path.join(dir, "memory.sqlite");
}

describe("API integration (local backend)", () => {
  test("chat -> memory -> timeline shows supersession", async () => {
    const dbPath = tempDbPath();
    const env = {
      XTRACE_API_KEY: undefined,
      XTRACE_ORG_ID: undefined,
      XTRACE_APP_ID: "xtrace-memory-support-agent",
      XTRACE_MOCK: false,
      MEMORY_BACKEND: "local",
      LOCAL_DB_PATH: dbPath,
      OPENAI_API_KEY: undefined,
      OPENAI_MODEL: "gpt-4.1-mini",
      PORT: 0
    } as any;

    const app = await buildApp(env, { logger: false });

    const userId = "customer_test_1";

    const r1 = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        userId,
        convId: "s1",
        mode: "with_memory",
        message: "We are on the Pro plan. Prefer email updates. We use QuickBooks."
      }
    });
    expect(r1.statusCode).toBe(200);

    const r2 = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        userId,
        convId: "s2",
        mode: "with_memory",
        message: "Actually we upgraded to Enterprise. Use Slack instead of email."
      }
    });
    expect(r2.statusCode).toBe(200);
    const body2 = r2.json();
    expect(body2.writeResult.supersededCount).toBeGreaterThan(0);

    const active = await app.inject({ method: "GET", url: `/api/memory/${encodeURIComponent(userId)}` });
    expect(active.statusCode).toBe(200);
    const activeJson = active.json();
    expect(activeJson.facts.some((f: any) => String(f.text).toLowerCase().includes("enterprise"))).toBe(true);

    const timeline = await app.inject({ method: "GET", url: `/api/memory/${encodeURIComponent(userId)}/timeline` });
    expect(timeline.statusCode).toBe(200);
    const timelineJson = timeline.json();
    expect(timelineJson.timeline.some((e: any) => e.status === "superseded")).toBe(true);

    await app.close();
  });
});

