import type { Env } from "../config.js";
import { MemoryService } from "./memory-service.js";
import { LocalMemoryService } from "./local-memory-service.js";
import { MockMemoryService } from "./mock-memory-service.js";

export type MemoryServiceLike = Pick<
  MemoryService,
  "ingestTurn" | "retrieveContext" | "listFacts" | "buildTimeline" | "buildRichTimeline" | "listAllMemories" | "listMemoriesByType" | "getMemoryById" | "resetUser"
>;

export function createMemoryService(env: Env): MemoryServiceLike {
  switch (env.MEMORY_BACKEND) {
    case "mock":
      return new MockMemoryService(env.XTRACE_APP_ID) as any;
    case "xtrace":
      return new MemoryService(env);
    case "local":
    default:
      return new LocalMemoryService({ appId: env.XTRACE_APP_ID, dbPath: env.LOCAL_DB_PATH }) as any;
  }
}
