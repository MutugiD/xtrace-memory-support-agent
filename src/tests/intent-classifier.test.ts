import { describe, expect, test } from "vitest";
import { needsMemory } from "../agent/intent-classifier.js";

describe("needsMemory", () => {
  test("skips trivial greetings", () => {
    expect(needsMemory("hi")).toBe(false);
    expect(needsMemory("Hello!")).toBe(false);
    expect(needsMemory("thanks")).toBe(false);
    expect(needsMemory("ok")).toBe(false);
  });

  test("retrieves for substantive messages", () => {
    expect(needsMemory("We upgraded to Enterprise last week.")).toBe(true);
    expect(needsMemory("Can you help with invoice reconciliation?")).toBe(true);
  });
});

