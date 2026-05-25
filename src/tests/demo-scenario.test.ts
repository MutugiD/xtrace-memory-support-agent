import { describe, expect, test } from "vitest";
import { SupportAgent } from "../agent/support-agent.js";

describe("support agent write result", () => {
  test("surfaces supersession events from ingest", async () => {
    const env = {
      XTRACE_API_KEY: "xtk_test",
      XTRACE_ORG_ID: "org_test",
      XTRACE_APP_ID: "xtrace-memory-support-agent",
      OPENAI_MODEL: "gpt-4.1-mini",
      PORT: 3000
    } as any;

    const fakeMemory = {
      async retrieveContext() {
        return { contextPrompt: "- Plan: Pro", memories: [] };
      },
      async ingestTurn() {
        return {
          jobId: "job_1",
          created: [],
          updated: [],
          supersededBy: { mem_old: "mem_new" },
          stageTimings: { total: 1 }
        };
      }
    };

    const agent = new SupportAgent(env, { memoryService: fakeMemory as any });
    const res = await agent.handleChatTurn({
      userId: "customer_123",
      convId: "session_002",
      customerMessage: "Actually we upgraded to Enterprise.",
      mode: "with_memory"
    });

    expect(res.writeResult.supersededCount).toBe(1);
    expect(res.writeResult.supersededBy.mem_old).toBe("mem_new");
  });
});
