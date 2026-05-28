import { describe, expect, test } from "vitest";
import { evaluateReconciliation } from "../reconciliation/reconciliation-engine.js";
import type { FinanceBelief, ProviderDataset } from "../shared/types.js";

function buildDataset(provider: "quickbooks" | "zoho", overrides?: Partial<ProviderDataset>): ProviderDataset {
  return {
    provider,
    tenantId: "tenant-engine",
    syncedAt: "2026-05-24T12:00:00Z",
    accounts: [],
    invoices: [],
    payments: [],
    journalEntries: [],
    customers: [],
    vendors: [],
    checkpoints: [],
    rawSummary: { source: "sandbox", recordsRead: 0 },
    ...overrides
  };
}

describe("reconciliation engine", () => {
  test("detects tolerance, missing counterpart, and duplicate payment mismatches", () => {
    const quickbooks = buildDataset("quickbooks", {
      invoices: [
        {
          id: "qb1",
          tenantId: "tenant-engine",
          provider: "quickbooks",
          externalId: "qb1",
          invoiceNumber: "INV-1001",
          customerName: "Acme",
          amount: 500,
          balance: 0,
          currency: "USD",
          issuedAt: "2026-05-20",
          dueAt: null,
          status: "paid",
          updatedAt: "2026-05-24T10:00:00Z"
        },
        {
          id: "qb2",
          tenantId: "tenant-engine",
          provider: "quickbooks",
          externalId: "qb2",
          invoiceNumber: "INV-1002",
          customerName: "Acme",
          amount: 500,
          balance: 0,
          currency: "USD",
          issuedAt: "2026-05-20",
          dueAt: null,
          status: "paid",
          updatedAt: "2026-05-24T10:00:00Z"
        }
      ],
      payments: [
        {
          id: "pay1",
          tenantId: "tenant-engine",
          provider: "quickbooks",
          externalId: "pay1",
          invoiceNumbers: ["INV-1002"],
          amount: 500,
          currency: "USD",
          paidAt: "2026-05-24",
          reference: "PAY-1002",
          updatedAt: "2026-05-24T11:00:00Z"
        },
        {
          id: "pay2",
          tenantId: "tenant-engine",
          provider: "quickbooks",
          externalId: "pay2",
          invoiceNumbers: ["INV-1002"],
          amount: 500,
          currency: "USD",
          paidAt: "2026-05-24",
          reference: "PAY-1002",
          updatedAt: "2026-05-24T11:01:00Z"
        }
      ]
    });

    const zoho = buildDataset("zoho", {
      invoices: [
        {
          id: "zo1",
          tenantId: "tenant-engine",
          provider: "zoho",
          externalId: "zo1",
          invoiceNumber: "INV-1001",
          customerName: "Acme",
          amount: 505,
          balance: 5,
          currency: "USD",
          issuedAt: "2026-05-20",
          dueAt: null,
          status: "open",
          updatedAt: "2026-05-24T10:00:00Z"
        },
        {
          id: "zo2",
          tenantId: "tenant-engine",
          provider: "zoho",
          externalId: "zo2",
          invoiceNumber: "INV-1003",
          customerName: "Gamma",
          amount: 300,
          balance: 300,
          currency: "USD",
          issuedAt: "2026-05-20",
          dueAt: null,
          status: "open",
          updatedAt: "2026-05-24T10:00:00Z"
        }
      ],
      payments: []
    });

    const beliefs: FinanceBelief[] = [
      {
        id: "belief-1",
        tenantId: "tenant-engine",
        namespace: "finance",
        key: "tenant.reconciliation_tolerance",
        text: "Tolerance is 10 USD.",
        value: { amount: 10 },
        status: "active",
        scope: null,
        source: "test",
        runId: null,
        supersedes: null,
        replacedBy: null,
        createdAt: "2026-05-24T09:00:00Z",
        updatedAt: "2026-05-24T09:00:00Z"
      }
    ];

    const result = evaluateReconciliation({
      tenantId: "tenant-engine",
      providers: ["quickbooks", "zoho"],
      datasets: { quickbooks, zoho },
      contextBeliefs: beliefs,
      startedBy: "tester"
    });

    expect(result.run.summary.matches).toBe(0);
    expect(result.mismatches.some((mismatch) => mismatch.type === "amount_tolerance")).toBe(true);
    expect(result.mismatches.some((mismatch) => mismatch.type === "missing_counterpart")).toBe(true);
    expect(result.mismatches.some((mismatch) => mismatch.type === "duplicate_payment")).toBe(true);
  });
});
