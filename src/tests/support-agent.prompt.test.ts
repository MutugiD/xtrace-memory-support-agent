import { describe, expect, test } from "vitest";
import { buildSupportPrompt } from "../agent/prompt-builder.js";

describe("buildSupportPrompt", () => {
  test("includes memory block in with_memory mode", () => {
    const msgs = buildSupportPrompt({
      mode: "with_memory",
      customerMessage: "Hello",
      memoryContextPrompt: "- Plan: Enterprise",
      retrievedMemories: []
    });
    expect(msgs[0]!.content).toContain("Known customer context");
    expect(msgs[0]!.content).toContain("Plan: Enterprise");
  });

  test("omits memory block when stateless", () => {
    const msgs = buildSupportPrompt({
      mode: "stateless",
      customerMessage: "Hello",
      memoryContextPrompt: "- Plan: Enterprise",
      retrievedMemories: []
    });
    expect(msgs[0]!.content).not.toContain("Known customer context");
  });
});

