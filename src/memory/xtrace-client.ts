import { MemoryClient } from "@xtraceai/memory";
import * as dns from "node:dns";
import * as https from "node:https";
import * as http from "node:http";
import type { Env } from "../config.js";

// Force IPv4 DNS — XTrace API times out on IPv6 in WSL/Linux.
dns.setDefaultResultOrder("ipv4first");

// IPv4-only agents for XTrace API calls.
const ipv4HttpsAgent = new https.Agent({ family: 4, keepAlive: true });
const ipv4HttpAgent = new http.Agent({ family: 4, keepAlive: true });

/**
 * Custom fetch that routes requests through IPv4-only HTTP agents.
 * Needed because Node's undici-based fetch tries IPv6 first on some
 * systems (WSL), causing timeouts to api.production.xtrace.ai.
 */
function createIpv4Fetch(): typeof globalThis.fetch {
  return async function xtraceFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? new URL(input) : input instanceof URL ? input : new URL(input.url);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const hdrs: Record<string, string> = {};

    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => { hdrs[k] = v; });
      } else if (typeof init.headers === "object" && !Array.isArray(init.headers)) {
        for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
          hdrs[k] = v;
        }
      }
    } else if (input instanceof Request) {
      input.headers.forEach((v, k) => { hdrs[k] = v; });
    }

    const reqBody = init?.body ? (init.body as string) : undefined;
    const isHttps = url.protocol === "https:";
    const agent = isHttps ? ipv4HttpsAgent : ipv4HttpAgent;

    return new Promise<Response>((resolve, reject) => {
      const options: https.RequestOptions = {
        method,
        headers: hdrs,
        agent,
      };

      const isHttpModule = isHttps ? https : http;
      const req = isHttpModule.request(url, options, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: string | Buffer) => chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk));
        res.on("end", () => {
          const responseBody = Buffer.concat(chunks).toString("utf-8");
          const responseHeaders = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (v) responseHeaders.set(k, Array.isArray(v) ? v.join(", ") : v);
          }
          resolve(new Response(responseBody, { status: res.statusCode, headers: responseHeaders }));
        });
      });

      req.on("error", reject);
      if (reqBody) req.write(reqBody);
      req.end();
    });
  };
}

let singleton: MemoryClient | null = null;

export function createMemoryClient(env: Env): MemoryClient {
  if (singleton) return singleton;
  if (!env.XTRACE_API_KEY || !env.XTRACE_ORG_ID) {
    throw new Error("XTRACE_API_KEY and XTRACE_ORG_ID are required to use the live XTrace client (or set XTRACE_MOCK=1).");
  }

  singleton = new MemoryClient({
    apiKey: env.XTRACE_API_KEY,
    orgId: env.XTRACE_ORG_ID,
    fetch: createIpv4Fetch() as any,
  });

  return singleton;
}