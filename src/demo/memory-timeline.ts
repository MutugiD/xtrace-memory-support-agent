// Force IPv4 DNS — XTrace API times out on IPv6 in some environments (WSL)
import * as dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import { loadEnv } from "../config.js";
import { createMemoryService } from "../memory/memory-provider.js";

function groupKey(status: string | null): "ACTIVE" | "SUPERSEDED" | "RETRACTED" | "UNKNOWN" {
  if (!status || status === "active") return "ACTIVE";
  if (status === "superseded") return "SUPERSEDED";
  if (status === "retracted") return "RETRACTED";
  return "UNKNOWN";
}

async function main() {
  const env = loadEnv();
  const userId = process.argv[2] ?? "customer_123";

  const memory = createMemoryService(env);
  const timeline = await memory.buildTimeline({ userId });

  const groups: Record<string, typeof timeline> = { ACTIVE: [], SUPERSEDED: [], RETRACTED: [], UNKNOWN: [] };
  for (const e of timeline) groups[groupKey(e.status)].push(e);

  process.stdout.write(`Memory Timeline for ${userId}\n`);
  process.stdout.write(`App scope: ${env.XTRACE_APP_ID}\n\n`);

  for (const k of ["ACTIVE", "SUPERSEDED", "RETRACTED", "UNKNOWN"]) {
    const rows = groups[k] ?? [];
    process.stdout.write(`== ${k} ==\n`);
    if (!rows.length) {
      process.stdout.write("(none)\n\n");
      continue;
    }
    for (const e of rows) {
      process.stdout.write(`[${e.createdAt}] ${e.id}\n`);
      process.stdout.write(`${e.text}\n`);
      if (e.supersedes) process.stdout.write(`supersedes: ${e.supersedes}\n`);
      if (e.replacedBy) process.stdout.write(`replaced_by: ${e.replacedBy}\n`);
      process.stdout.write("\n");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
