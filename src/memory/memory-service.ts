import type { Memory, MemoryStatus } from "@xtraceai/memory";
import { createMemoryClient } from "./xtrace-client.js";
import type { Env } from "../config.js";
import type { ConversationMessage, MemoryWriteResult } from "./memory-types.js";
import { toXtraceMessages } from "./memory-types.js";

export type TimelineEvent = {
  id: string;
  createdAt: string;
  updatedAt: string;
  convId: string | null;
  text: string;
  status: MemoryStatus | null;
  supersedes: string | null;
  replacedBy: string | null;
  factType: string | null;
  sourceRole: string | null;
};

function isActiveStatus(status: MemoryStatus | null): boolean {
  return status === "active" || status === null;
}

export function computeTimelineFromFacts(allFacts: Memory[]): TimelineEvent[] {
  const replacedBy = new Map<string, string>();

  for (const mem of allFacts) {
    if (mem.type !== "fact") continue;
    const supersedes = mem.details?.supersedes ?? null;
    if (supersedes) replacedBy.set(supersedes, mem.id);
  }

  return allFacts
    .filter((m) => m.type === "fact")
    .map((m) => ({
      id: m.id,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
      convId: m.conv_id,
      text: m.text,
      status: m.details?.status ?? null,
      supersedes: m.details?.supersedes ?? null,
      replacedBy: replacedBy.get(m.id) ?? null,
      factType: m.details?.fact_type ?? null,
      sourceRole: m.details?.source_role ?? null
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export class MemoryService {
  constructor(private readonly env: Env) {}

  private client() {
    return createMemoryClient(this.env);
  }

  async ingestTurn(params: {
    userId: string;
    convId: string;
    messages: ConversationMessage[];
    metadata?: Record<string, unknown>;
  }): Promise<MemoryWriteResult> {
    const client = this.client();
    const job = await client.memories.ingest(
      {
        user_id: params.userId,
        conv_id: params.convId,
        app_id: this.env.XTRACE_APP_ID,
        metadata: params.metadata ?? {},
        messages: toXtraceMessages(params.messages)
      },
      { wait: true }
    );

    const done = job.status === "succeeded" ? job : await client.memories.jobs.pollUntilDone(job.id);
    if (done.status !== "succeeded" || !done.result) {
      const message = done.error?.message ?? "Unknown error";
      throw new Error(`XTrace ingest failed (status=${done.status}): ${message}`);
    }

    return {
      jobId: done.id,
      created: done.result.memories_created ?? [],
      updated: done.result.memories_updated ?? [],
      supersededBy: done.result.memories_superseded_by ?? {},
      stageTimings: done.result.stage_timings ?? undefined
    };
  }

  async retrieveContext(params: {
    userId: string;
    query: string;
  }): Promise<{ contextPrompt: string | null; memories: Memory[]; stageTimings?: Record<string, number> }> {
    const client = this.client();
    const env = await client.memories.retrieve({
      query: params.query,
      limit: 12,
      filters: { user_id: params.userId, app_id: this.env.XTRACE_APP_ID },
      include: ["context_prompt"]
    });

    const contextPrompt = env.extras?.context_prompt ?? null;
    return { contextPrompt, memories: env.data ?? [], stageTimings: env.extras?.stage_timings ?? undefined };
  }

  async listFacts(params: { userId: string; includeSuperseded: boolean }): Promise<Memory[]> {
    const client = this.client();
    const facts: Memory[] = [];
    for await (const memory of client.memories.list({
      user_id: params.userId,
      app_id: this.env.XTRACE_APP_ID,
      type: "fact",
      order: "created_at_asc"
    })) {
      if (memory.type !== "fact") continue;
      if (params.includeSuperseded) facts.push(memory);
      else {
        const status = memory.details?.status ?? null;
        if (isActiveStatus(status)) facts.push(memory);
      }
    }
    return facts;
  }

  async buildTimeline(params: { userId: string }): Promise<TimelineEvent[]> {
    const allFacts = await this.listFacts({ userId: params.userId, includeSuperseded: true });
    return computeTimelineFromFacts(allFacts);
  }

  async resetUser(params: { userId: string }): Promise<{ deleted: number }> {
    const client = this.client();
    const ids: string[] = [];
    for await (const memory of client.memories.list({
      user_id: params.userId,
      app_id: this.env.XTRACE_APP_ID,
      order: "created_at_desc"
    })) {
      ids.push(memory.id);
    }

    for (const id of ids) {
      await client.memories.delete(id);
    }
    return { deleted: ids.length };
  }
}

