# Connector Onboarding Guide

Add new providers by implementing the shared adapter contract in `services/shared/types.ts`.

## Required adapter methods

- `connectTenant`
- `refreshConnection`
- `syncAccounts`
- `syncInvoices`
- `syncPayments`
- `syncJournalEntries`
- `syncCustomers`
- `syncVendors`
- `fetchDelta`
- `handleWebhook`

## Normalization rules

Each adapter must emit canonical objects for:

- `Account`
- `Invoice`
- `Payment`
- `JournalEntry`
- `Customer`
- `Vendor`
- `SyncCheckpoint`

Provider-specific fields should stay in the raw source files or adapter internals; downstream services should only consume canonical shapes.

## Current provider modes

- `sandbox` — built-in provider fixture data
- `file` — provider export file path supplied per tenant connection

`file` mode is the recommended path for masked production-like test data.
