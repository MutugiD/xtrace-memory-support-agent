import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { ConnectorService } from "../connector/connector-service.js";

function tempDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "recon-connectors-"));
}

describe("ConnectorService contracts", () => {
  test("QuickBooks and Zoho normalize sandbox data through the same interface", async () => {
    const service = new ConnectorService(tempDataDir(), "secret");
    const tenantId = "tenant-contracts";

    await service.connectTenant({ tenantId, provider: "quickbooks", mode: "sandbox", connectedBy: "tester" });
    await service.connectTenant({ tenantId, provider: "zoho", mode: "sandbox", connectedBy: "tester" });

    const quickbooks = await service.syncTenantData(tenantId, "quickbooks");
    const zoho = await service.syncTenantData(tenantId, "zoho");

    expect(quickbooks.accounts.length).toBeGreaterThan(0);
    expect(quickbooks.invoices[0]).toMatchObject({
      provider: "quickbooks",
      tenantId,
      invoiceNumber: expect.any(String)
    });

    expect(zoho.accounts.length).toBeGreaterThan(0);
    expect(zoho.invoices[0]).toMatchObject({
      provider: "zoho",
      tenantId,
      invoiceNumber: expect.any(String)
    });

    const delta = await service.fetchDelta(tenantId, "zoho", "2026-05-24T10:10:00Z");
    expect(delta.invoices.some((invoice) => invoice.invoiceNumber === "INV-1004")).toBe(true);
  });
});
