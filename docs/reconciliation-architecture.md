# Reconciliation Microservices Architecture

The reconciliation layer lives beside the existing support-memory app and does not replace it.

## Services

- **Gateway** — authenticates tenant requests, enforces roles, and exposes one reconciliation API surface
- **Connector** — manages QuickBooks and Zoho connections, fixture/file imports, normalization, and sync/delta behavior
- **Finance Memory** — stores tenant-specific reconciliation beliefs such as source-of-truth preferences, mappings, tolerances, and manual resolution history
- **Reconciliation** — evaluates canonical ledger datasets and produces runs, mismatches, and exports
- **Workflow** — orchestrates sync → context retrieval → reconciliation → audit logging → resolution persistence
- **Audit** — records redacted service events for tenant-scoped reporting

## Data flow

1. A tenant connects QuickBooks and Zoho through the Gateway.
2. Connector adapters normalize provider records into canonical models.
3. Workflow loads finance memory context for the tenant.
4. Reconciliation evaluates invoices, payments, and sync freshness.
5. Results are persisted as runs, mismatches, resolutions, and audit events.
6. Manual resolutions are stored back into finance memory for future runs.

## Separation from the support-memory app

- Existing support-memory routes stay under `src/api/*`
- Reconciliation APIs live under `/api/reconciliation/*`
- Existing support-memory tests remain the protected baseline
- Reconciliation services use their own tenant-scoped memory state under `data/reconciliation/`
