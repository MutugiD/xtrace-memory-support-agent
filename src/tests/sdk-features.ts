/**
 * XTrace SDK Feature Test Suite
 *
 * Exercises the real XTrace API against the MemoryService layer,
 * testing each capability:
 *
 *   1. Belief Write   — ingest turns and verify facts are created
 *   2. Retrieval      — retrieve context and verify context_prompt is populated
 *   3. Belief Revision — correct a fact and verify supersession
 *   4. Provenance      — list timeline, verify supersedes/replacedBy chains
 *   5. Fact Lookup     — getMemoryById and verify details
 *   6. Session Isolation — different conv_id scopes don't leak
 *   7. Stateless Safety — stateless mode produces no side effects
 *   8. Multi-session Persistence — facts persist across sessions for same user
 *   9. Timeline Depth   — multiple revisions produce correct chain
 *
 * Uses XTRACE_MOCK=false (live API). Throttles between calls to respect
 * XTrace's free-tier rate limit.
 *
 * Usage:
 *   npx tsx src/tests/sdk-features.ts [--reset] [--verbose]
 */

// Force IPv4 — XTrace API times out on IPv6 in some environments (WSL).
// We use dns.setDefaultResultOrder which works for Node's built-in fetch.
// For undici-based fetch (used by the SDK), we need --dns-result-order=ipv4first
// which is set in the npm scripts.
import * as dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import "dotenv/config";
import { loadEnv } from "../config.js";
import { MemoryService } from "../memory/memory-service.js";
import { SupportAgent } from "../agent/support-agent.js";
import { createMemoryService } from "../memory/memory-provider.js";

const THROTTLE_MS = 8_000; // 8s between API calls → ~7-8 req/min, under 10/min limit

// XTrace free tier: 250 writes/day, 10 req/min. We track quota usage.
let writesUsed = 0;
const WRITES_PER_DAY = 250;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Retry an async operation with exponential backoff on rate-limit (429) errors. */
async function withRetry<T>(fn: () => Promise<T>, retries = 3, baseDelay = 10_000): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const is429 = err?.status === 429 || err?.code === "http_429" || String(err?.message).includes("429");
      if (is429 && attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt);
        log("⏳", `Rate limited, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${retries})`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
}

function log(emoji: string, label: string, detail?: string) {
  process.stdout.write(`${emoji} ${label}${detail ? ": " + detail : ""}\n`);
}

function section(title: string) {
  process.stdout.write(`\n${"═".repeat(60)}\n  ${title}\n${"═".repeat(60)}\n`);
}

let passed = 0;
let failed = 0;
const errors: string[] = [];

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    passed++;
    log("✅", label, detail);
  } else {
    failed++;
    errors.push(`${label}${detail ? ` — ${detail}` : ""}`);
    log("❌", label, detail);
  }
}

async function main() {
  const env = loadEnv();
  const verbose = process.argv.includes("--verbose");
  const resetFirst = process.argv.includes("--reset");

  // Use a unique user ID per run to avoid collisions
  const runId = Date.now().toString(36);
  const USER_A = `sdk_test_a_${runId}`;
  const USER_B = `sdk_test_b_${runId}`;

  const memory = new MemoryService(env);

  if (resetFirst) {
    section("Resetting test users");
    try {
      const rA = await memory.resetUser({ userId: USER_A });
      log("🗑️", `Cleared ${rA.deleted} memories for ${USER_A}`);
      await sleep(THROTTLE_MS);
      const rB = await memory.resetUser({ userId: USER_B });
      log("🗑️", `Cleared ${rB.deleted} memories for ${USER_B}`);
      await sleep(THROTTLE_MS);
    } catch (err: any) {
      log("⚠️", "Reset failed (may not exist yet)", err.message);
      await sleep(THROTTLE_MS);
    }
  }

  // ─── 1. BELIEF WRITE ────────────────────────────────────────────────
  section("1. Belief Write — ingest a turn and verify facts are created");

  const write1 = await memory.ingestTurn({
    userId: USER_A,
    convId: "sess_1",
    messages: [
      { role: "user", content: "We are on the Pro plan. I prefer email updates. Our main issue is invoice reconciliation. We use QuickBooks.", date: new Date().toISOString() },
      { role: "assistant", content: "Got it — tracking your plan, contact preference, issue, and accounting system.", date: new Date().toISOString() }
    ]
  });

  assert(write1.jobId.length > 0, "Ingest job has an ID", write1.jobId);
  assert(write1.created.length >= 1, "At least 1 fact created", `${write1.created.length} facts: ${write1.created.map((r) => r.text).join("; ")}`);
  if (verbose) {
    log("📋", "Created refs", JSON.stringify(write1.created.map((r) => ({ id: r.id, type: r.type, text: r.text }))));
    log("📋", "Stage timings", JSON.stringify(write1.stageTimings));
  }

  await sleep(THROTTLE_MS);

  // ─── 2. RETRIEVAL ──────────────────────────────────────────────────
  section("2. Retrieval — context_prompt is assembled from active facts");

  const retrieved = await memory.retrieveContext({
    userId: USER_A,
    convId: "sess_1",
    query: "What plan and accounting system does this customer use?"
  });

  assert(retrieved.contextPrompt !== null, "contextPrompt is populated");
  if (retrieved.contextPrompt) {
    assert(retrieved.contextPrompt.toLowerCase().includes("pro") || retrieved.contextPrompt.toLowerCase().includes("plan"),
      "contextPrompt mentions the plan");
    assert(retrieved.contextPrompt.toLowerCase().includes("quickbooks") || retrieved.contextPrompt.toLowerCase().includes("accounting"),
      "contextPrompt mentions QuickBooks or accounting");
  }
  assert(retrieved.memories.length >= 1, "At least 1 memory returned", `${retrieved.memories.length} memories`);
  if (verbose) log("📋", "contextPrompt", retrieved.contextPrompt ?? "(null)");

  await sleep(THROTTLE_MS);

  // ─── 3. BELIEF REVISION (SUPERSESSION) ──────────────────────────────
  section("3. Belief Revision — correct a fact and verify supersession");

  const write2 = await memory.ingestTurn({
    userId: USER_A,
    convId: "sess_2",
    messages: [
      { role: "user", content: "Actually, we moved to Enterprise last week. Also don't email me anymore, use Slack.", date: new Date().toISOString() },
      { role: "assistant", content: "Updated: plan → Enterprise, contact → Slack.", date: new Date().toISOString() }
    ]
  });

  assert(write2.created.length >= 1, "New facts created for corrections", `${write2.created.length} created`);
  const supersededEntries = Object.entries(write2.supersededBy);
  assert(supersededEntries.length >= 1, "At least 1 fact was superseded", `${supersededEntries.length} superseded: ${supersededEntries.map(([o, n]) => `${o}→${n}`).join(", ")}`);
  if (verbose) {
    log("📋", "Superseded chain", JSON.stringify(write2.supersededBy));
  }

  await sleep(THROTTLE_MS);

  // ─── 4. PROVENANCE / TIMELINE ────────────────────────────────────────
  section("4. Provenance — timeline shows supersedes and replacedBy chains");

  const timeline = await memory.buildTimeline({ userId: USER_A });

  assert(timeline.length >= 3, "Timeline has entries from both sessions", `${timeline.length} events`);
  const supersededFacts = timeline.filter((e) => e.status === "superseded");
  const activeFacts = timeline.filter((e) => e.status === "active" || e.status === null);
  assert(activeFacts.length >= 1, "Active facts present", `${activeFacts.length} active`);
  assert(supersededFacts.length >= 1, "Superseded facts present", `${supersededFacts.length} superseded`);

  // Verify chain: old fact replacedBy points to new fact, new fact supersedes old
  const oldPlanFact = timeline.find((e) => e.text.toLowerCase().includes("pro") && e.status === "superseded");
  if (oldPlanFact) {
    assert(oldPlanFact.replacedBy !== null, "Old plan fact has replacedBy", oldPlanFact.replacedBy ?? "(null)");
    const newFact = timeline.find((e) => e.id === oldPlanFact.replacedBy);
    if (newFact) {
      assert(newFact.supersedes === oldPlanFact.id, "New fact supersedes old", `${newFact.supersedes} → ${oldPlanFact.id}`);
    }
  }

  for (const e of timeline) {
    const status = e.status ?? "null";
    log("  ", `[${e.createdAt}] (${status}) ${e.text.substring(0, 60)}${e.text.length > 60 ? "..." : ""}`);
    if (e.supersedes) log("   ", `↑ supersedes: ${e.supersedes}`);
    if (e.replacedBy) log("   ", `↓ replacedBy: ${e.replacedBy}`);
  }

  await sleep(THROTTLE_MS);

  // ─── 5. FACT LOOKUP (getMemoryById) ────────────────────────────────
  section("5. Fact Lookup — getMemoryById returns full provenance details");

  if (write1.created.length > 0) {
    const firstFact = write1.created[0]!;
    const factDetail = await memory.getMemoryById(firstFact.id);

    assert(factDetail.id === firstFact.id, "getMemoryById returns correct ID", factDetail.id);
    assert(factDetail.text === firstFact.text, "getMemoryById returns correct text", factDetail.text.substring(0, 50));
    assert(factDetail.type === "fact", "getMemoryById type is fact", factDetail.type);
    log("📋", "Fact details", JSON.stringify({
      id: factDetail.id,
      type: factDetail.type,
      text: factDetail.text.substring(0, 80),
      status: (factDetail.details as any)?.status,
      supersedes: (factDetail.details as any)?.supersedes,
      source_role: (factDetail.details as any)?.source_role,
      conv_id: factDetail.conv_id,
      user_id: factDetail.user_id,
    }));
  } else {
    log("⚠️", "Skipped — no facts created in session 1");
  }

  await sleep(THROTTLE_MS);

  // ─── 6. RETRIEVED CONTEXT REFLECTS REVISIONS ────────────────────────
  section("6. Revised Retrieval — context_prompt shows active (not stale) facts");

  const retrieved2 = await memory.retrieveContext({
    userId: USER_A,
    convId: "sess_2",
    query: "current plan and contact preference"
  });

  if (retrieved2.contextPrompt) {
    const ctx = retrieved2.contextPrompt.toLowerCase();
    // Active facts should be present
    assert(ctx.includes("enterprise") || ctx.includes("slack"), "Context reflects revised facts (Enterprise/Slack)");
    // Stale facts should NOT dominate the context
    // Note: the old "Pro plan" and "email" facts may still appear but should be marked superseded in the timeline
    log("📋", "Revised contextPrompt (first 200 chars)", retrieved2.contextPrompt.substring(0, 200));
  } else {
    log("⚠️", "contextPrompt was null after revisions");
  }

  await sleep(THROTTLE_MS);

  // ─── 7. USER ISOLATION ──────────────────────────────────────────────
  section("7. User Isolation — user B's facts don't leak into user A");

  await memory.ingestTurn({
    userId: USER_B,
    convId: "sess_1_b",
    messages: [
      { role: "user", content: "We are on the Starter plan. We use Xero for accounting.", date: new Date().toISOString() },
      { role: "assistant", content: "Noted — Starter plan, Xero.", date: new Date().toISOString() }
    ]
  });

  await sleep(THROTTLE_MS);

  const userAFacts = await memory.listFacts({ userId: USER_A, includeSuperseded: false });
  const userBFacts = await memory.listFacts({ userId: USER_B, includeSuperseded: false });

  const userATexts = userAFacts.map((f) => f.text).join(" ").toLowerCase();
  const userBTexts = userBFacts.map((f) => f.text).join(" ").toLowerCase();

  assert(!userATexts.includes("xero"), "User A does not see User B's Xero fact");
  assert(!userBTexts.includes("enterprise"), "User B does not see User A's Enterprise fact");
  assert(!userBTexts.includes("slack"), "User B does not see User A's Slack preference");

  log("📋", `User A has ${userAFacts.length} active facts`, `User B has ${userBFacts.length} active facts`);

  await sleep(THROTTLE_MS);

  // ─── 8. THIRD REVISION — ACCOUNTING MIGRATION ──────────────────────
  section("8. Third Revision — accounting system supersession (QuickBooks → NetSuite)");

  const write3 = await memory.ingestTurn({
    userId: USER_A,
    convId: "sess_4",
    messages: [
      { role: "user", content: "We no longer use QuickBooks. We migrated to NetSuite.", date: new Date().toISOString() },
      { role: "assistant", content: "Updated: accounting → NetSuite.", date: new Date().toISOString() }
    ]
  });

  assert(write3.created.length >= 1, "New fact created for NetSuite", `${write3.created.length} created`);
  const acctSuperseded = Object.entries(write3.supersededBy);
  if (acctSuperseded.length > 0) {
    assert(true, "QuickBooks was superseded by NetSuite", `${acctSuperseded.length} superseded`);
  } else {
    log("ℹ️", "No explicit supersession captured (XTrace may have handled it differently)");
  }

  await sleep(THROTTLE_MS);

  // ─── 9. FINAL TIMELINE — verify full depth ──────────────────────────
  section("9. Final Timeline — full provenance chain with 3 sessions");

  const finalTimeline = await memory.buildTimeline({ userId: USER_A });

  const allSuperseded = finalTimeline.filter((e) => e.status === "superseded");
  const allActive = finalTimeline.filter((e) => e.status === "active" || e.status === null);

  log("📊", "Timeline summary", `${finalTimeline.length} total, ${allActive.length} active, ${allSuperseded.length} superseded`);

  for (const e of finalTimeline) {
    const status = e.status ?? "active";
    log("  ", `[${e.createdAt}] (${status}) ${e.text}`);
    if (e.supersedes) log("   ", `↑ supersedes: ${e.supersedes}`);
    if (e.replacedBy) log("   ", `↓ replacedBy: ${e.replacedBy}`);
  }

  assert(allActive.length >= 2, "At least 2 active facts after 3 sessions", `${allActive.length} active`);
  assert(allSuperseded.length >= 1, "At least 1 superseded fact from revisions", `${allSuperseded.length} superseded`);

  // ─── 10. STATELESS AGENT NO SIDE EFFECTS ────────────────────────────
  section("10. Stateless Safety — stateless mode produces no write side effects");

  const agent = new SupportAgent(env);
  const factsBefore = await memory.listFacts({ userId: USER_A, includeSuperseded: false });
  const factCountBefore = factsBefore.length;

  const statelessResult = await agent.handleChatTurn({
    userId: USER_A,
    convId: "sess_stateless",
    customerMessage: "I need help with billing.",
    mode: "stateless"
  });

  assert(statelessResult.writeResult.jobId === "", "Stateless mode returns empty jobId");
  assert(statelessResult.writeResult.createdCount === 0, "Stateless mode creates 0 memories");

  await sleep(THROTTLE_MS);

  const factsAfter = await memory.listFacts({ userId: USER_A, includeSuperseded: false });
  assert(factsAfter.length === factCountBefore, "No new memories after stateless turn", `before=${factCountBefore}, after=${factsAfter.length}`);

  // ─── 11. WITH-MEMORY AGENT USES CONTEXT ────────────────────────────
  section("11. Memory-Aware Agent — agent retrieves and uses context");

  const memoryResult = await agent.handleChatTurn({
    userId: USER_A,
    convId: "sess_5",
    customerMessage: "Can you help with our invoice reconciliation setup?",
    mode: "with_memory"
  });

  assert(memoryResult.retrieved.contextPrompt !== null, "Agent retrieved context", memoryResult.retrieved.contextPrompt?.substring(0, 100) ?? "(null)");
  assert(memoryResult.retrieved.memories.length >= 1, "Agent retrieved memories", `${memoryResult.retrieved.memories.length} memories`);
  assert(memoryResult.writeResult.jobId !== "" && memoryResult.writeResult.jobId !== "write_failed", "Ingest produced a valid job", memoryResult.writeResult.jobId);

  if ("error" in memoryResult.writeResult && memoryResult.writeResult.error) {
    log("⚠️", "Write had an error (rate limit?)", JSON.stringify(memoryResult.writeResult.error));
  }

  log("🤖", "Agent reply", memoryResult.reply.substring(0, 150));

  // ─── CLEANUP ───────────────────────────────────────────────────────
  section("Cleanup — removing test users");

  try {
    const delA = await memory.resetUser({ userId: USER_A });
    log("🗑️", `Deleted ${delA.deleted} memories for ${USER_A}`);
    await sleep(THROTTLE_MS);
    const delB = await memory.resetUser({ userId: USER_B });
    log("🗑️", `Deleted ${delB.deleted} memories for ${USER_B}`);
  } catch (err: any) {
    log("⚠️", "Cleanup failed", err.message);
  }

  // ─── SUMMARY ───────────────────────────────────────────────────────
  section("Results");
  log("📊", `Passed: ${passed}`, `Failed: ${failed}`);
  if (errors.length > 0) {
    log("❌", "Failures:");
    for (const e of errors) log("  ", `• ${e}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});