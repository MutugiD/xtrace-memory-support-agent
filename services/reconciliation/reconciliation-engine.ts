import crypto from "node:crypto";
import type {
  FinanceBelief,
  ProviderDataset,
  ProviderName,
  ReconciliationMismatch,
  ReconciliationRun
} from "../shared/types.js";

function isoNow(): string {
  return new Date().toISOString();
}

function invoiceMap(dataset: ProviderDataset) {
  return new Map(dataset.invoices.map((invoice) => [invoice.invoiceNumber, invoice]));
}

function paymentKey(reference: string, invoiceNumber: string, amount: number) {
  return `${reference}::${invoiceNumber}::${amount}`;
}

function parseTolerance(beliefs: FinanceBelief[]): number {
  const explicit = beliefs.find((belief) => belief.key === "tenant.reconciliation_tolerance");
  const numeric =
    typeof explicit?.value === "number"
      ? explicit.value
      : explicit?.value && typeof explicit.value === "object" && typeof (explicit.value as any).amount === "number"
        ? Number((explicit.value as any).amount)
        : 10;
  return numeric;
}

export function evaluateReconciliation(params: {
  tenantId: string;
  providers: ProviderName[];
  datasets: Record<ProviderName, ProviderDataset>;
  contextBeliefs: FinanceBelief[];
  startedBy: string;
  idempotencyKey?: string;
}): { run: ReconciliationRun; mismatches: ReconciliationMismatch[] } {
  const quickbooks = params.datasets.quickbooks;
  const zoho = params.datasets.zoho;
  const tolerance = parseTolerance(params.contextBeliefs);
  const now = isoNow();
  const mismatches: ReconciliationMismatch[] = [];
  let matches = 0;
  let freshnessWarnings = 0;

  const qbInvoices = invoiceMap(quickbooks);
  const zohoInvoices = invoiceMap(zoho);
  const invoiceNumbers = new Set([...qbInvoices.keys(), ...zohoInvoices.keys()]);

  for (const invoiceNumber of invoiceNumbers) {
    const qbInvoice = qbInvoices.get(invoiceNumber);
    const zohoInvoice = zohoInvoices.get(invoiceNumber);

    if (!qbInvoice || !zohoInvoice) {
      mismatches.push({
        id: crypto.randomUUID(),
        tenantId: params.tenantId,
        runId: "",
        type: "missing_counterpart",
        status: "open",
        severity: "high",
        entityType: "invoice",
        entityKey: invoiceNumber,
        providerPair: ["quickbooks", "zoho"],
        summary: `Invoice ${invoiceNumber} is missing from ${!qbInvoice ? "QuickBooks" : "Zoho"}.`,
        details: {
          quickbooksPresent: Boolean(qbInvoice),
          zohoPresent: Boolean(zohoInvoice)
        },
        suggestedAction: "Review missing invoice sync and source mapping.",
        createdAt: now,
        updatedAt: now
      });
      continue;
    }

    const delta = Math.abs(qbInvoice.amount - zohoInvoice.amount);
    if (delta === 0) {
      matches++;
    } else if (delta <= tolerance) {
      mismatches.push({
        id: crypto.randomUUID(),
        tenantId: params.tenantId,
        runId: "",
        type: "amount_tolerance",
        status: "open",
        severity: "medium",
        entityType: "invoice",
        entityKey: invoiceNumber,
        providerPair: ["quickbooks", "zoho"],
        summary: `Invoice ${invoiceNumber} differs by ${delta}, within tolerance ${tolerance}.`,
        details: {
          quickbooksAmount: qbInvoice.amount,
          zohoAmount: zohoInvoice.amount,
          tolerance
        },
        suggestedAction: "Approve source-of-truth or adjust reconciliation tolerance.",
        createdAt: now,
        updatedAt: now
      });
    } else {
      mismatches.push({
        id: crypto.randomUUID(),
        tenantId: params.tenantId,
        runId: "",
        type: "amount_mismatch",
        status: "open",
        severity: "high",
        entityType: "invoice",
        entityKey: invoiceNumber,
        providerPair: ["quickbooks", "zoho"],
        summary: `Invoice ${invoiceNumber} differs by ${delta}, outside tolerance ${tolerance}.`,
        details: {
          quickbooksAmount: qbInvoice.amount,
          zohoAmount: zohoInvoice.amount,
          tolerance
        },
        suggestedAction: "Investigate incorrect invoice amount or mapping drift.",
        createdAt: now,
        updatedAt: now
      });
    }
  }

  const paymentCounts = new Map<string, number>();
  for (const dataset of [quickbooks, zoho]) {
    for (const payment of dataset.payments) {
      for (const invoiceNumber of payment.invoiceNumbers) {
        const key = paymentKey(payment.reference, invoiceNumber, payment.amount);
        paymentCounts.set(key, (paymentCounts.get(key) ?? 0) + 1);
      }
    }
  }

  for (const [key, count] of paymentCounts.entries()) {
    if (count > 1) {
      const [reference, invoiceNumber, amount] = key.split("::");
      mismatches.push({
        id: crypto.randomUUID(),
        tenantId: params.tenantId,
        runId: "",
        type: "duplicate_payment",
        status: "open",
        severity: "medium",
        entityType: "payment",
        entityKey: invoiceNumber,
        providerPair: ["quickbooks", "zoho"],
        summary: `Duplicate payment reference ${reference} detected for invoice ${invoiceNumber}.`,
        details: {
          reference,
          invoiceNumber,
          amount: Number(amount),
          count
        },
        suggestedAction: "Review duplicate posting or duplicate sync replay.",
        createdAt: now,
        updatedAt: now
      });
    }
  }

  const staleCutoffMs = 1000 * 60 * 60 * 12;
  for (const dataset of [quickbooks, zoho]) {
    const age = Date.now() - new Date(dataset.syncedAt).getTime();
    if (age > staleCutoffMs) {
      freshnessWarnings++;
      mismatches.push({
        id: crypto.randomUUID(),
        tenantId: params.tenantId,
        runId: "",
        type: "stale_sync",
        status: "open",
        severity: "low",
        entityType: "sync",
        entityKey: dataset.provider,
        providerPair: [dataset.provider, dataset.provider],
        summary: `${dataset.provider} data is stale relative to the reconciliation window.`,
        details: {
          syncedAt: dataset.syncedAt,
          ageMs: age
        },
        suggestedAction: "Refresh the connector before certifying the reconciliation report.",
        createdAt: now,
        updatedAt: now
      });
    }
  }

  const run: ReconciliationRun = {
    id: crypto.randomUUID(),
    tenantId: params.tenantId,
    status: "completed",
    providers: params.providers,
    startedBy: params.startedBy,
    idempotencyKey: params.idempotencyKey ?? null,
    startedAt: now,
    completedAt: now,
    summary: {
      matches,
      mismatches: mismatches.length,
      dataFreshnessWarnings: freshnessWarnings
    },
    contextSnapshot: params.contextBeliefs.map((belief) => belief.text)
  };

  const finalizedMismatches = mismatches.map((mismatch) => ({
    ...mismatch,
    runId: run.id
  }));

  return {
    run,
    mismatches: finalizedMismatches
  };
}
