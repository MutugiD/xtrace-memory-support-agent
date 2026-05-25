import { MemoryClient } from "@xtraceai/memory";
import type { Env } from "../config.js";

let singleton: MemoryClient | null = null;

export function createMemoryClient(env: Env): MemoryClient {
  if (singleton) return singleton;
  if (!env.XTRACE_API_KEY || !env.XTRACE_ORG_ID) {
    throw new Error("XTRACE_API_KEY and XTRACE_ORG_ID are required to use the live XTrace client (or set XTRACE_MOCK=1).");
  }
  singleton = new MemoryClient({
    apiKey: env.XTRACE_API_KEY,
    orgId: env.XTRACE_ORG_ID
  });
  return singleton;
}
