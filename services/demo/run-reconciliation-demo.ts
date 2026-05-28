import "dotenv/config";
import { loadServiceEnv } from "../shared/service-env.js";
import { createReconciliationContainer } from "../gateway/service-container.js";

async function main() {
  const env = loadServiceEnv();
  const container = createReconciliationContainer(env.dataDir, env.secret);
  const tenantId = "tenant_demo";

  await container.financeMemoryService.resetTenant(tenantId);

  await container.connectorService.connectTenant({
    tenantId,
    provider: "quickbooks",
    mode: "sandbox",
    connectedBy: "demo"
  });
  await container.connectorService.connectTenant({
    tenantId,
    provider: "zoho",
    mode: "sandbox",
    connectedBy: "demo"
  });

  await container.financeMemoryService.recordBeliefs({
    tenantId,
    source: "demo",
    beliefs: [
      {
        key: "tenant.reconciliation_tolerance",
        text: "Tolerance is 10 USD for invoice amount differences.",
        value: { amount: 10, currency: "USD" }
      }
    ]
  });

  const result = await container.workflowService.runReconciliation({
    tenantId,
    startedBy: "demo-user",
    actorRole: "admin"
  });

  console.log("=== Reconciliation Run ===");
  console.log(`Run: ${result.run.id}`);
  console.log(`Matches: ${result.run.summary.matches}`);
  console.log(`Mismatches: ${result.run.summary.mismatches}`);
  console.log("");
  for (const mismatch of result.mismatches) {
    console.log(`- [${mismatch.type}] ${mismatch.summary}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
