import type { Memory } from "@xtraceai/memory";

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  let score = 0;
  for (const t of a) if (b.has(t)) score += 1;
  return score;
}

function factKeyPriority(factKey: string | null | undefined): number {
  switch (factKey) {
    case "customer.plan":
      return 5;
    case "customer.contact_preference":
      return 4;
    case "customer.issue":
      return 4;
    case "customer.accounting_system":
      return 4;
    default:
      return 1;
  }
}

export function rankActiveFactsForQuery(facts: Memory[], query: string): Memory[] {
  const q = tokenize(query);
  const scored = facts.map((m) => {
    const textTokens = tokenize(m.text ?? "");
    const overlap = overlapScore(q, textTokens);
    const priority = factKeyPriority((m as any).details?.fact_key) * 2;
    // recency: newer gets a small bump (created_at is ISO string)
    const recency = Date.parse(m.created_at) / 1_000_000_000;
    return { m, score: overlap + priority + recency * 0.000001 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.m);
}

export function buildContextPrompt(memories: Memory[]): string | null {
  if (!memories.length) return null;
  const bullets = memories.map((m) => `- ${m.text}`);
  return `Known customer context:\n${bullets.join("\n")}`;
}

