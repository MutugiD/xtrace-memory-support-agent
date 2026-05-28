# Reconciliation Runbook

## Local startup

```bash
npm ci
npm run dev:reconciliation
```

Health check:

```bash
GET http://localhost:3400/health
```

## Typical flow

1. Connect QuickBooks and Zoho for a tenant
2. Seed finance beliefs such as tolerance or preferred source system
3. Start a reconciliation run
4. Review mismatches
5. Resolve mismatches and confirm audit output

## Useful scripts

- `npm run demo:reconciliation`
- `npm run test:reconciliation`
- `npm run build`

## Data locations

- support-memory local DB: `LOCAL_DB_PATH`
- reconciliation state: `RECONCILIATION_DATA_DIR`
