import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { FinanceMemoryService } from "../finance-memory/finance-memory-service.js";

function tempDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "finance-memory-"));
}

describe("FinanceMemoryService", () => {
  test("stores beliefs, supersedes changes, and retrieves active context only", async () => {
    const service = new FinanceMemoryService(tempDataDir());
    const tenantId = "tenant-finance";

    const first = await service.recordBeliefs({
      tenantId,
      source: "test",
      beliefs: [
        {
          key: "tenant.account_mapping",
          text: "Account 4000 maps to receivables.",
          value: { source: "4000", target: "receivables" },
          scope: "accounts"
        }
      ]
    });
    expect(first.created).toHaveLength(1);

    const second = await service.recordBeliefs({
      tenantId,
      source: "test",
      beliefs: [
        {
          key: "tenant.account_mapping",
          text: "Account 4000 maps to trade receivables.",
          value: { source: "4000", target: "trade_receivables" },
          scope: "accounts"
        }
      ]
    });
    expect(Object.keys(second.superseded)).toHaveLength(1);

    const active = await service.listActiveBeliefs({ tenantId, scope: "accounts" });
    expect(active).toHaveLength(1);
    expect(active[0]?.text).toContain("trade receivables");

    const context = await service.retrieveContext({
      tenantId,
      topic: "account mapping for receivables",
      scope: "accounts"
    });
    expect(context.context[0]).toContain("trade receivables");

    const timeline = await service.listTimeline({ tenantId, scope: "accounts" });
    expect(timeline.some((belief) => belief.status === "superseded")).toBe(true);
    expect(timeline.find((belief) => belief.status === "superseded")?.replacedBy).toBeTruthy();
  });
});
