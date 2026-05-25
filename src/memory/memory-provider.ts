import type { Env } from "../config.js";
import { MemoryService } from "./memory-service.js";
import { MockMemoryService } from "./mock-memory-service.js";

export type MemoryServiceLike = Pick<
  MemoryService,
  "ingestTurn" | "retrieveContext" | "listFacts" | "buildTimeline" | "buildRichTimeline" | "listAllMemories" | "listMemoriesByType" | "getMemoryById" | "resetUser"
>;

export function createMemoryService(env: Env): MemoryServiceLike {
  if (env.XTRACE_MOCK) return new MockMemoryService(env.XTRACE_APP_ID) as any;
  return new MemoryService(env);
}