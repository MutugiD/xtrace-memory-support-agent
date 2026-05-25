import crypto from "node:crypto";
import type { Memory, MemoryRef } from "@xtraceai/memory";
import type { ConversationMessage, MemoryWriteResult } from "./memory-types.js";
import type { TimelineEvent } from "./memory-service.js";
import { computeTimelineFromFacts } from "./memory-service.js";

type FactKey = "plan" | "contact" | "issue" | "accounting";

function uuid(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

function factKeyFromText(text: string): FactKey | null {
  const t = text.toLowerCase();
  if (t.includes("plan")) return "plan";
  if (t.includes("prefers") || t.includes("slack") || t.includes("email")) return "contact";
  if (t.includes("issue") || t.includes("reconciliation") || t.includes("invoice")) return "issue";
  if (t.includes("quickbooks") || t.includes("netsuite")) return "accounting";
  return null;
}

function extractFactsFromUserMessage(message: string): Array<{ key: FactKey; text: string }> {
  const m = message.toLowerCase();
  const out: Array<{ key: FactKey; text: string }> = [];

  const planMatch = m.match(/\b(pro|enterprise|starter|business)\b/);
  if (planMatch) out.push({ key: "plan", text: `User is on the ${capitalize(planMatch[1])} plan.` });

  if (m.includes("slack")) out.push({ key: "contact", text: "User prefers Slack for updates instead of email." });
  else if (m.includes("email")) out.push({ key: "contact", text: "User prefers email updates." });

  if (m.includes("invoice") || m.includes("reconciliation")) out.push({ key: "issue", text: "User's main issue is invoice reconciliation." });

  if (m.includes("quickbooks")) out.push({ key: "accounting", text: "User uses QuickBooks." });
  if (m.includes("netsuite")) out.push({ key: "accounting", text: "User uses NetSuite." });

  return dedupeByKeyText(out);
}

function dedupeByKeyText<T extends { key: string; text: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = `${it.key}|${it.text}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function makeFactMemory(params: {
  id: string;
  userId: string;
  convId: string;
  appId: string;
  text: string;
  createdAt: string;
  supersedes: string | null;
  status: "active" | "superseded" | "retracted";
}): Memory {
  return {
    id: params.id,
    object: "memory",
    type: "fact",
    text: params.text,
    user_id: params.userId,
    agent_id: null,
    conv_id: params.convId,
    app_id: params.appId,
    metadata: { mock: true },
    categories: [],
    score: null,
    created_at: params.createdAt,
    updated_at: params.createdAt,
    details: {
      fact_type: "mock",
      status: params.status,
      supersedes: params.supersedes,
      source_role: "user",
      episode_id: null,
      artifact_id: null,
      artifact_ids: [],
      source_event_ids: []
    }
  } as any;
}

type Store = {
  factsByUser: Map<string, Memory[]>;
};

const store: Store = {
  factsByUser: new Map()
};

export class MockMemoryService {
  constructor(private readonly appId: string) {}

  async ingestTurn(params: {
    userId: string;
    convId: string;
    messages: ConversationMessage[];
    metadata?: Record<string, unknown>;
  }): Promise<MemoryWriteResult> {
    const userMessages = params.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
    const extracted = extractFactsFromUserMessage(userMessages);

    const existing = store.factsByUser.get(params.userId) ?? [];
    const created: MemoryRef[] = [];
    const updated: MemoryRef[] = [];
    const supersededBy: Record<string, string> = {};

    for (const e of extracted) {
      const key = e.key;
      const prev = existing
        .filter((m) => m.type === "fact")
        .find((m) => factKeyFromText(m.text) === key && (m.details?.status ?? "active") === "active");

      const same = prev && prev.text === e.text;
      if (same) continue;

      const id = uuid();
      const createdAt = nowIso();

      const memory = makeFactMemory({
        id,
        userId: params.userId,
        convId: params.convId,
        appId: this.appId,
        text: e.text,
        createdAt,
        supersedes: prev ? prev.id : null,
        status: "active"
      });

      existing.push(memory);
      created.push({ id: memory.id, type: "fact", text: memory.text });

      if (prev) {
        (prev as any).details.status = "superseded";
        supersededBy[prev.id] = memory.id;
      }
    }

    store.factsByUser.set(params.userId, existing);

    return {
      jobId: `mock_job_${uuid()}`,
      created,
      updated,
      supersededBy,
      stageTimings: { mock_total_ms: 1 }
    };
  }

  async retrieveContext(params: {
    userId: string;
    convId: string;
    query: string;
  }): Promise<{ contextPrompt: string | null; memories: Memory[]; stageTimings?: Record<string, number> }> {
    const all = store.factsByUser.get(params.userId) ?? [];
    const active = all.filter((m) => m.type === "fact" && (m.details?.status ?? "active") === "active");

    const lines = active.map((m) => `- ${m.text}`);
    return {
      contextPrompt: lines.length ? lines.join("\n") : null,
      memories: active,
      stageTimings: { mock_retrieve_ms: 1 }
    };
  }

  async listFacts(params: { userId: string; includeSuperseded: boolean }): Promise<Memory[]> {
    const all = store.factsByUser.get(params.userId) ?? [];
    if (params.includeSuperseded) return [...all];
    return all.filter((m) => m.type === "fact" && (m.details?.status ?? "active") === "active");
  }

  /** Look up a single memory by ID from the in-memory store. */
  async getMemoryById(memoryId: string): Promise<any> {
    for (const facts of store.factsByUser.values()) {
      const found = facts.find((m) => m.id === memoryId);
      if (found) return found;
    }
    throw new Error(`Memory not found: ${memoryId}`);
  }

  /** List all memory types (mock only tracks facts). */
  async listAllMemories(params: { userId: string }): Promise<any[]> {
    const all = store.factsByUser.get(params.userId) ?? [];
    return [...all];
  }

  /** List memories by type (mock only has facts). */
  async listMemoriesByType(params: { userId: string; type: string }): Promise<any[]> {
    if (params.type === "fact") return this.listFacts({ userId: params.userId, includeSuperseded: true });
    // Episodes and artifacts not generated by the mock service
    return [];
  }

  /** Build a rich timeline (mock returns same as regular timeline since mock only has facts). */
  async buildRichTimeline(params: { userId: string }): Promise<any[]> {
    return this.buildTimeline(params);
  }

  async buildTimeline(params: { userId: string }): Promise<TimelineEvent[]> {
    const all = await this.listFacts({ userId: params.userId, includeSuperseded: true });
    return computeTimelineFromFacts(all);
  }

  async resetUser(params: { userId: string }): Promise<{ deleted: number }> {
    const all = store.factsByUser.get(params.userId) ?? [];
    store.factsByUser.delete(params.userId);
    return { deleted: all.length };
  }
}

