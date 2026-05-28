# Finance Memory Model

The finance memory service is independent from the support-memory service.

## Supported belief keys

- `tenant.account_mapping`
- `tenant.customer_alias`
- `tenant.vendor_alias`
- `tenant.reconciliation_tolerance`
- `tenant.preferred_source_system`
- `tenant.exception_resolution_rule`

## Belief lifecycle

- **active** — current belief used by reconciliation flows
- **superseded** — older belief replaced by a newer one
- **retracted** — belief explicitly invalidated

## Retrieval behavior

- Retrieval returns active beliefs only
- Beliefs can be scoped for subdomains such as `accounts`
- Reconciliation runs snapshot the active context they used

## Why it matters

This keeps:

- tenant policies durable across runs
- manual decisions auditable
- mapping drift visible instead of silently overwritten
