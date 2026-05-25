// Force IPv4 DNS — XTrace API times out on IPv6 in some environments (WSL)
import * as dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import { loadEnv } from "../config.js";
import { createMemoryService } from "../memory/memory-provider.js";
import { runSupportDemo } from "./scenarios.js";

function line(title: string) {
  process.stdout.write(`\n=== ${title} ===\n`);
}

function printWriteSummary(writeResult: any) {
  process.stdout.write(
    [
      `Memory write job: ${writeResult.jobId}`,
      `created=${writeResult.createdCount} updated=${writeResult.updatedCount} superseded=${writeResult.supersededCount}`
    ].join("\n") + "\n"
  );
  const map = writeResult.supersededBy ?? {};
  const pairs = Object.entries(map);
  if (pairs.length) {
    process.stdout.write("superseded chain:\n");
    for (const [oldId, newId] of pairs) {
      process.stdout.write(`- ${oldId} -> ${newId}\n`);
    }
  }
}

async function main() {
  const env = loadEnv();
  const userId = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "customer_123";
  const doReset = process.argv.includes("--reset");

  const memory = createMemoryService(env);
  if (doReset) {
    line(`Reset (${userId})`);
    const res = await memory.resetUser({ userId });
    process.stdout.write(`Deleted ${res.deleted} memories (soft-delete)\n`);
  }

  line("Scripted Demo");
  const report = await runSupportDemo(env, { userId });

  for (const { turn, res } of report.results) {
    line(turn.session);
    process.stdout.write(`User: ${turn.userMessage}\n\n`);
    process.stdout.write(`Agent (${res.usedLlm ? "LLM" : "template"}):\n${res.reply}\n\n`);
    printWriteSummary(res.writeResult);
  }

  line("Comparison (stateless vs with memory)");
  const withMemory = report.results[2]!.res.reply;
  const stateless = report.comparison.stateless.reply;
  process.stdout.write("With XTrace memory:\n");
  process.stdout.write(withMemory + "\n\n");
  process.stdout.write("Without memory:\n");
  process.stdout.write(stateless + "\n");

  line("Timeline (facts)");
  const timeline = await memory.buildTimeline({ userId });
  for (const e of timeline) {
    process.stdout.write(`[${e.createdAt}] (${e.status ?? "unknown"}) ${e.text}\n`);
    if (e.supersedes) process.stdout.write(`  supersedes: ${e.supersedes}\n`);
    if (e.replacedBy) process.stdout.write(`  replaced_by: ${e.replacedBy}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
