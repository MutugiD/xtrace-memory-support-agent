import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { createReconciliationContainer } from "../gateway/service-container.js";

function tempDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "recon-workflow-"));
}

describe("WorkflowService integration", () => {
  test("runs reconciliation, persists audit events, and records manual resolution memory", async () => {
    const container = createReconciliationContainer(tempDataDir(), "secret");
    const tenantId = "tenant-workflow";

    await container.connectorService.connectTenant({ tenantId, provider: "quickbooks", mode: "sandbox", connectedBy: "ops" });
    await container.connectorService.connectTenant({ tenantId, provider: "zoho", mode: "sandbox", connectedBy: "ops" });
    await container.financeMemoryService.recordBeliefs({
      tenantId,
      beliefs: [
        {
          key: "tenant.reconciliation_tolerance",
          text: "Tolerance is 10 USD for invoice differences.",
          value: { amount: 10 }
        }
      ]
    });

    const result = await container.workflowService.runReconciliation({
      tenantId,
      startedBy: "ops-user",
      actorRole: "admin"
    });

    expect(result.run.summary.mismatches).toBeGreaterThan(0);
    const firstMismatch = result.mismatches[0];
    expect(firstMismatch).toBeTruthy();

    const resolution = await container.workflowService.resolveMismatch({
      tenantId,
      mismatchId: firstMismatch!.id,
      action: "resolved_manually",
      notes: "Validated against masked ledger extract.",
      actorRole: "reviewer"
    });
    expect(resolution.mismatchId).toBe(firstMismatch!.id);

    const audit = await container.auditService.buildReport(tenantId);
    expect(audit.events.some((event) => event.action === "reconciliation.completed")).toBe(true);
    expect(audit.events.some((event) => event.action === "mismatch.resolved")).toBe(true);

    const memoryTimeline = await container.financeMemoryService.listTimeline({ tenantId });
    expect(memoryTimeline.some((belief) => belief.key === "tenant.exception_resolution_rule")).toBe(true);
  });
});
