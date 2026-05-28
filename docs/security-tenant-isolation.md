# Security and Tenant Isolation

The reconciliation services ship with secure local defaults for development and testing.

## Current controls

- Connector credentials are encrypted at rest before writing to disk
- Sensitive fields are redacted before audit persistence
- Every API request is tenant-scoped via `x-tenant-id`
- Role enforcement is applied at the gateway using:
  - `admin`
  - `operator`
  - `reviewer`
  - `read_only`
- Idempotency keys are supported for reconciliation run creation

## Operational expectations

- Set `SERVICE_TOKEN_SECRET` per environment
- Use distinct `RECONCILIATION_DATA_DIR` paths per environment or tenant test run
- Use masked or sandbox data only for shared test environments
- Keep provider export files out of git and under controlled storage
