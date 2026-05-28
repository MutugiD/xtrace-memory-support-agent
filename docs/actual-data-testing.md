# Actual-Data Testing Guide

Use sandbox or masked provider exports only.

## Recommended workflow

1. Export tenant data from QuickBooks or Zoho into a controlled local file.
2. Remove or mask direct identifiers that are not needed for reconciliation validation.
3. Connect the tenant using `mode=file` and pass the fixture path when creating the connector connection.
4. Run reconciliation and compare results against a manually verified expected outcome.

## Validation checklist

- invoices normalize correctly
- payments link to invoice numbers correctly
- account codes and customer/vendor names preserve expected mappings
- tolerance-based mismatches are surfaced
- duplicate payments are surfaced
- missing-counterpart cases are surfaced
- manual resolutions are persisted into finance memory
- audit report contains the expected evidence trail

## Notes

- The built-in connector fixtures are realistic seed datasets and also serve as examples for masked file inputs.
- Keep raw exports outside version control.
