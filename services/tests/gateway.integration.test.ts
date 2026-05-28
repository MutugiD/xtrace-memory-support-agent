import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { buildGatewayApp } from "../gateway/build-gateway-app.js";

function tempDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "recon-gateway-"));
}

const headers = {
  "x-tenant-id": "tenant-gateway",
  "x-role": "admin",
  "x-actor-id": "gateway-user"
};

describe("Reconciliation gateway", () => {
  test("connects providers, runs reconciliation, and exposes reports", async () => {
    const app = await buildGatewayApp({
      dataDir: tempDataDir(),
      secret: "secret",
      logger: false
    });

    const fixturePathQuickBooks = path.join(process.cwd(), "services", "connector", "fixtures", "quickbooks-sandbox.json");
    const fixturePathZoho = path.join(process.cwd(), "services", "connector", "fixtures", "zoho-sandbox.json");

    const connectQuickBooks = await app.inject({
      method: "POST",
      url: "/api/reconciliation/connectors/connect",
      headers,
      payload: {
        provider: "quickbooks",
        mode: "file",
        fixturePath: fixturePathQuickBooks
      }
    });
    expect(connectQuickBooks.statusCode).toBe(200);

    const connectZoho = await app.inject({
      method: "POST",
      url: "/api/reconciliation/connectors/connect",
      headers,
      payload: {
        provider: "zoho",
        mode: "file",
        fixturePath: fixturePathZoho
      }
    });
    expect(connectZoho.statusCode).toBe(200);

    const beliefs = await app.inject({
      method: "POST",
      url: "/api/reconciliation/memory/beliefs",
      headers,
      payload: {
        beliefs: [
          {
            key: "tenant.reconciliation_tolerance",
            text: "Tolerance is 10 USD for reconciliation variance.",
            value: { amount: 10, currency: "USD" }
          }
        ]
      }
    });
    expect(beliefs.statusCode).toBe(200);

    const run = await app.inject({
      method: "POST",
      url: "/api/reconciliation/runs",
      headers: {
        ...headers,
        "idempotency-key": "idem-1"
      },
      payload: {}
    });
    expect(run.statusCode).toBe(200);
    const runBody = run.json();
    expect(runBody.run.summary.mismatches).toBeGreaterThan(0);

    const rerun = await app.inject({
      method: "POST",
      url: "/api/reconciliation/runs",
      headers: {
        ...headers,
        "idempotency-key": "idem-1"
      },
      payload: {}
    });
    expect(rerun.statusCode).toBe(200);
    expect(rerun.json().run.id).toBe(runBody.run.id);

    const report = await app.inject({
      method: "GET",
      url: `/api/reconciliation/reports/${runBody.run.id}`,
      headers
    });
    expect(report.statusCode).toBe(200);
    expect(report.json().mismatches.length).toBeGreaterThan(0);

    const readOnlyForbidden = await app.inject({
      method: "POST",
      url: "/api/reconciliation/runs",
      headers: {
        "x-tenant-id": "tenant-gateway",
        "x-role": "read_only",
        "x-actor-id": "viewer"
      },
      payload: {}
    });
    expect(readOnlyForbidden.statusCode).toBe(403);

    await app.close();
  });
});
