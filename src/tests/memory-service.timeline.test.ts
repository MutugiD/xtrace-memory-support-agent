import { describe, expect, test } from "vitest";
import { computeTimelineFromFacts } from "../memory/memory-service.js";

function fact(params: {
  id: string;
  text: string;
  createdAt: string;
  status?: "active" | "superseded" | "retracted";
  supersedes?: string | null;
}) {
  return {
    id: params.id,
    object: "memory",
    type: "fact",
    text: params.text,
    user_id: "customer_123",
    agent_id: null,
    conv_id: "session_001",
    app_id: "xtrace-memory-support-agent",
    metadata: {},
    categories: [],
    score: null,
    created_at: params.createdAt,
    updated_at: params.createdAt,
    details: {
      fact_type: "demo",
      status: params.status ?? "active",
      supersedes: params.supersedes ?? null,
      source_role: "user",
      episode_id: null,
      artifact_id: null,
      artifact_ids: [],
      source_event_ids: []
    }
  } as any;
}

describe("computeTimelineFromFacts", () => {
  test("computes replacedBy by reversing supersedes", () => {
    const a = fact({ id: "mem_a", text: "Plan = Pro", createdAt: "2026-05-25T08:10:00.000Z" });
    const b = fact({
      id: "mem_b",
      text: "Plan = Enterprise",
      createdAt: "2026-05-25T08:18:00.000Z",
      status: "active",
      supersedes: "mem_a"
    });

    const timeline = computeTimelineFromFacts([a, b]);
    const rowA = timeline.find((x) => x.id === "mem_a")!;
    const rowB = timeline.find((x) => x.id === "mem_b")!;

    expect(rowA.replacedBy).toBe("mem_b");
    expect(rowB.supersedes).toBe("mem_a");
  });
});

