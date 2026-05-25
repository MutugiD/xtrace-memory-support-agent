import type { Memory } from "@xtraceai/memory";
import { createMemoryClient } from "./xtrace-client.js";
import type { Env } from "../config.js";
import type { ConversationMessage, MemoryWriteResult } from "./memory-types.js";
import { toXtraceMessages } from "./memory-types.js";

export type TimelineEvent = {
  id: string;
  type: "fact" | "episode" | "artifact";
  createdAt: string;
  updatedAt: string;
  convId: string | null;
  text: string;
  status: string | null;
  supersedes: string | null;
  replacedBy: string | null;
  factType: string | null;
  sourceRole: string | null;
  // Episode-specific
  title: string | null;
  startedAt: string | null;
  endedAt: string | null;
  factIds: string[];
  artifactIds: string[];
  // Artifact-specific
  rationale: string | null;
  version: number | null;
  rootId: string | null;
  sourceFactIds: string[];
  episodeIds: string[];
};

function isActiveStatus(status: string | null): boolean {
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
      type: "fact" as const,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
      convId: m.conv_id,
      text: m.text,
      status: (m.details as any)?.status ?? null,
      supersedes: (m.details as any)?.supersedes ?? null,
      replacedBy: replacedBy.get(m.id) ?? null,
      factType: (m.details as any)?.fact_type ?? null,
      sourceRole: (m.details as any)?.source_role ?? null,
      title: null,
      startedAt: null,
      endedAt: null,
      factIds: [],
      artifactIds: [],
      rationale: null,
      version: null,
      rootId: null,
      sourceFactIds: [],
      episodeIds: []
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Build a rich timeline including facts, episodes, and artifacts. */
export function computeRichTimeline(allMemories: Memory[]): TimelineEvent[] {
  const replacedBy = new Map<string, string>();

  // Build supersession map from facts
  for (const mem of allMemories) {
    if (mem.type !== "fact") continue;
    const supersedes = (mem.details as any)?.supersedes ?? null;
    if (supersedes) replacedBy.set(supersedes, mem.id);
  }

  return allMemories
    .map((m): TimelineEvent => {
      const base: TimelineEvent = {
        id: m.id,
        type: "fact",
        createdAt: m.created_at,
        updatedAt: m.updated_at,
        convId: m.conv_id,
        text: m.text,
        status: null,
        supersedes: null,
        replacedBy: replacedBy.get(m.id) ?? null,
        factType: null,
        sourceRole: null,
        title: null,
        startedAt: null,
        endedAt: null,
        factIds: [],
        artifactIds: [],
        rationale: null,
        version: null,
        rootId: null,
        sourceFactIds: [],
        episodeIds: []
      };

      if (m.type === "fact") {
        base.type = "fact";
        base.status = (m.details as any)?.status ?? null;
        base.supersedes = (m.details as any)?.supersedes ?? null;
        base.factType = (m.details as any)?.fact_type ?? null;
        base.sourceRole = (m.details as any)?.source_role ?? null;
      } else if (m.type === "episode") {
        base.type = "episode";
        const details = m.details as any;
        base.title = details?.title ?? null;
        base.startedAt = details?.started_at ?? null;
        base.endedAt = details?.ended_at ?? null;
        base.factIds = details?.fact_ids ?? [];
        base.artifactIds = details?.artifact_ids ?? [];
      } else if (m.type === "artifact") {
        base.type = "artifact";
        const details = m.details as any;
        base.title = details?.title ?? null;
        base.rationale = details?.rationale ?? null;
        base.version = details?.version ?? null;
        base.rootId = details?.root_id ?? null;
        base.sourceFactIds = details?.source_fact_ids ?? [];
        base.episodeIds = details?.episode_ids ?? [];
      }

      return base;
    })
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
    extractArtifacts?: boolean;
  }): Promise<MemoryWriteResult> {
    const client = this.client();
    const job = await client.memories.ingest(
      {
        user_id: params.userId,
        conv_id: params.convId,
        app_id: this.env.XTRACE_APP_ID,
        metadata: params.metadata ?? {},
        messages: toXtraceMessages(params.messages),
        extract_artifacts: params.extractArtifacts ?? false
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
    convId: string;
    query: string;
  }): Promise<{ contextPrompt: string | null; memories: Memory[]; stageTimings?: Record<string, number> }> {
    const client = this.client();
    const env = await client.memories.retrieve({
      query: params.query,
      limit: 12,
      filters: { user_id: params.userId, conv_id: params.convId, app_id: this.env.XTRACE_APP_ID },
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
        const status = (memory.details as any)?.status ?? null;
        if (isActiveStatus(status)) facts.push(memory);
      }
    }
    return facts;
  }

  /** List all memories of a given type (fact, episode, artifact) for a user. */
  async listMemoriesByType(params: { userId: string; type: "fact" | "episode" | "artifact" }): Promise<Memory[]> {
    const client = this.client();
    const results: Memory[] = [];
    for await (const memory of client.memories.list({
      user_id: params.userId,
      app_id: this.env.XTRACE_APP_ID,
      type: params.type,
      order: "created_at_asc"
    })) {
      if (memory.type === params.type) results.push(memory);
    }
    return results;
  }

  /** List all memory types (facts, episodes, artifacts) for a user. */
  async listAllMemories(params: { userId: string }): Promise<Memory[]> {
    const client = this.client();
    const all: Memory[] = [];
    for await (const memory of client.memories.list({
      user_id: params.userId,
      app_id: this.env.XTRACE_APP_ID,
      order: "created_at_asc"
    })) {
      all.push(memory);
    }
    return all;
  }

  /** Fetch a single memory by ID with full provenance details. */
  async getMemoryById(memoryId: string): Promise<Memory> {
    const client = this.client();
    return client.memories.get(memoryId);
  }

  async buildTimeline(params: { userId: string }): Promise<TimelineEvent[]> {
    const allFacts = await this.listFacts({ userId: params.userId, includeSuperseded: true });
    return computeTimelineFromFacts(allFacts);
  }

  /** Build a rich timeline including facts, episodes, and artifacts. */
  async buildRichTimeline(params: { userId: string }): Promise<TimelineEvent[]> {
    const allMemories = await this.listAllMemories({ userId: params.userId });
    return computeRichTimeline(allMemories);
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