import { MemoryClient } from "@xtraceai/memory";
import type { Env } from "../config.js";

let singleton: MemoryClient | null = null;

export function createMemoryClient(env: Env): MemoryClient {
  if (singleton) return singleton;
  singleton = new MemoryClient({
    apiKey: env.XTRACE_API_KEY,
    orgId: env.XTRACE_ORG_ID
  });
  return singleton;
}

