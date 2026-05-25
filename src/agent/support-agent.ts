import type { Memory } from "@xtraceai/memory";
import type { Env } from "../config.js";
import { needsMemory } from "./intent-classifier.js";
import { buildSupportPrompt, type AgentMode } from "./prompt-builder.js";
import { generateSupportReply } from "./response-generator.js";
import type { MemoryServiceLike } from "../memory/memory-provider.js";
import { createMemoryService } from "../memory/memory-provider.js";

export type ChatTurnResult = {
  reply: string;
  usedLlm: boolean;
  retrieved: {
    contextPrompt: string | null;
    memories: Memory[];
  };
  writeResult: {
    jobId: string;
    createdCount: number;
    updatedCount: number;
    supersededCount: number;
    supersededBy: Record<string, string>;
    stageTimings?: Record<string, number>;
  };
};

export class SupportAgent {
  private readonly memory: Pick<MemoryServiceLike, "retrieveContext" | "ingestTurn">;

  constructor(
    private readonly env: Env,
    deps?: {
      memoryService?: Pick<MemoryServiceLike, "retrieveContext" | "ingestTurn">;
    }
  ) {
    this.memory = deps?.memoryService ?? createMemoryService(env);
  }

  async handleChatTurn(params: {
    userId: string;
    convId: string;
    customerMessage: string;
    mode: AgentMode;
  }): Promise<ChatTurnResult> {
    const shouldRetrieve = params.mode === "with_memory" && needsMemory(params.customerMessage);

    const retrievalQuery = `${params.customerMessage}\n\nCustomer support context: plan, contact preference, current issue, accounting system, technical stack.`;
    const retrieved = shouldRetrieve
      ? await this.memory.retrieveContext({ userId: params.userId, convId: params.convId, query: retrievalQuery })
      : { contextPrompt: null, memories: [] as Memory[] };

    const llmMessages = buildSupportPrompt({
      mode: params.mode,
      customerMessage: params.customerMessage,
      memoryContextPrompt: retrieved.contextPrompt,
      retrievedMemories: retrieved.memories
    });

    const { reply, usedLlm } = await generateSupportReply(this.env, {
      mode: params.mode,
      customerMessage: params.customerMessage,
      memoryContextPrompt: retrieved.contextPrompt,
      retrievedMemories: retrieved.memories,
      llmMessages
    });

    const now = new Date().toISOString();
    const writeResult = await this.memory.ingestTurn({
      userId: params.userId,
      convId: params.convId,
      metadata: { demo: true, mode: params.mode },
      messages: [
        { role: "user", content: params.customerMessage, date: now },
        { role: "assistant", content: reply, date: now }
      ]
    });

    const supersededCount = Object.keys(writeResult.supersededBy ?? {}).length;

    return {
      reply,
      usedLlm,
      retrieved: {
        contextPrompt: retrieved.contextPrompt,
        memories: retrieved.memories
      },
      writeResult: {
        jobId: writeResult.jobId,
        createdCount: writeResult.created.length,
        updatedCount: writeResult.updated.length,
        supersededCount,
        supersededBy: writeResult.supersededBy,
        stageTimings: writeResult.stageTimings
      }
    };
  }
}
