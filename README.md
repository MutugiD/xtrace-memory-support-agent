# XTrace Memory Support Agent

A Fastify + TypeScript demo that uses the **XTrace Memory API** to give a support agent durable, revisable customer context across sessions. The focus is on memory as **belief revision**, with **contradiction handling**, **provenance**, and **continuity** — not just retrieval over chat logs.

## What it demonstrates

- **Memory write pipeline:** every customer/agent turn is ingested via `memories.ingest`. XTrace extracts structured facts, not raw chat logs.
- **Belief revision / contradictions:** when a customer corrects themselves (plan Pro → Enterprise, contact email → Slack), old facts are **superseded** — not duplicated. The `memories_superseded_by` and `details.supersedes` fields surface this explicitly.
- **Retrieval for continuity:** before responding, the agent retrieves XTrace's assembled `context_prompt` via `memories.retrieve`. New sessions start with relevant context (no cold start).
- **Provenance / timeline:** active + superseded + retracted facts with lineage (`supersedes` → computed `replacedBy`). Every fact is traceable to the session (`conv_id`) that produced it.
- **Episodes & artifacts:** XTrace can extract not just facts but **episodes** (conversation summaries that reference their constituent facts) and **artifacts** (structured knowledge documents that reference source facts). Enabled via `extract_artifacts: true`.
- **Stateless vs memory-aware comparison:** the scripted demo runs both modes back-to-back so the pain point is obvious in 30 seconds.
- **Single-fact lookup:** `GET /api/memory/:userId/facts/:factId` returns full provenance details for any fact.
- **Rich timeline:** `GET /api/memory/:userId/rich-timeline` returns facts, episodes, and artifacts together with cross-references.
- **SDK feature tests:** 13-test live suite exercising belief write, retrieval, revision, provenance, fact lookup, user isolation, episodes, artifacts, and stateless safety against the real XTrace API.

## Why I built this

Support teams lose customer context across tickets. Generic "memory" implementations (chat logs + vector search) can retrieve old notes, but they don't reliably handle **when a fact changed**, **which fact is current**, or **why it changed**.

This demo solves exactly that: a support agent that remembers customer facts across sessions, but also knows when those facts have been corrected — Pro → Enterprise, QuickBooks → NetSuite, email → Slack. Each revision is tracked, not overwritten silently.

## Quickstart

### 1) Install

```bash
npm ci
```

### 2) Configure environment

```bash
cp .env.example .env
```

Required for live XTrace:
- `XTRACE_API_KEY`
- `XTRACE_ORG_ID`

Optional:
- `OPENAI_API_KEY` (if omitted or unavailable, replies fall back to deterministic templates)
- `MEMORY_BACKEND=local|mock|xtrace` (default: `local`)
- `LOCAL_DB_PATH=./data/memory.sqlite` (used when `MEMORY_BACKEND=local`)
- `XTRACE_MOCK=1` (legacy alias for `MEMORY_BACKEND=mock`)

### 3) Scripted demo (CLI)

```bash
npm run demo -- --reset
```

The scripted scenario includes a contradiction example (QuickBooks → NetSuite) so you can observe supersession.

### 4) Run the web app

```bash
npm run dev
```

Open `http://localhost:3000/`.

### 5) Provenance / timeline (CLI)

```bash
npm run memory:timeline -- customer_123
```

### 6) SDK feature tests (live API)

```bash
npm run test:sdk:reset
```

This runs a throttled test suite against the real XTrace API, verifying all 13 capabilities below. Requires `XTRACE_API_KEY` and `XTRACE_ORG_ID` in `.env`.

## API

- `POST /api/chat`
  - body: `{ "userId", "convId", "message", "mode": "with_memory" | "stateless" }`
  - In `with_memory` mode: retrieves context, generates reply, ingests turn. In `stateless` mode: no memory read or write.
- `GET /api/memory/:userId`
  - returns active facts only
- `GET /api/memory/:userId/timeline`
  - returns all facts with `supersedes` + computed `replacedBy`
- `GET /api/memory/:userId/rich-timeline`
  - returns facts, episodes, and artifacts with cross-references
- `GET /api/memory/:userId/:type`
  - list memories by type (`fact`, `episode`, `artifact`)
- `GET /api/memory/:userId/facts/:factId`
  - returns a single fact with full provenance details
- `POST /api/demo/run`
  - runs scripted scenario
- `DELETE /api/demo/reset?userId=customer_123`
  - deletes demo-scoped memories (scoped by `XTRACE_APP_ID`)

## Testing

```bash
npm test
```

Unit tests use `XTRACE_MOCK=1` and do not require network access.

### SDK feature tests (live)

```bash
npm run test:sdk:reset
```

Tests each XTrace capability in sequence:

| # | Feature | What it verifies |
|---|---------|------------------|
| 1 | Belief Write | `ingest` creates facts with structured text |
| 2 | Retrieval | `retrieve` returns `context_prompt` with active facts |
| 3 | Belief Revision | Second `ingest` supersedes old facts (Pro→Enterprise, email→Slack) |
| 4 | Provenance | Timeline shows `supersedes` and computed `replacedBy` chains |
| 5 | Fact Lookup | `getMemoryById` returns full fact details with `source_role`, `conv_id` |
| 6 | Revised Retrieval | `context_prompt` reflects current facts, not stale ones |
| 7 | User Isolation | User B's facts don't appear in User A's context |
| 8 | Third Revision | QuickBooks→NetSuite supersession produces correct chain |
| 9 | Final Timeline | All 3 sessions produce correct provenance depth |
| 10 | Stateless Safety | `stateless` mode returns zero write side effects |
| 11 | Memory-Aware Agent | Agent retrieves context and uses it in the reply |
| 12 | Episodes & Artifacts | `ingest(extract_artifacts: true)` produces episode/artifact memories; episodes reference `fact_ids`, artifacts reference `source_fact_ids` |
| 13 | Rich Timeline | `buildRichTimeline()` returns facts, episodes, and artifacts together with verified cross-references |

See `docs/sdk-features-tests.md` for detailed per-test results.

## CI/CD

- CI: `.github/workflows/ci.yml` runs `npm ci`, `npm test`, `npm run build` on PRs and pushes to `main`.
- SDK tests: `.github/workflows/sdk-tests.yml` runs live XTrace API tests on pushes to `main` (requires `XTRACE_API_KEY` and `XTRACE_ORG_ID` secrets).
- CD: `.github/workflows/docker.yml` builds and pushes a Docker image to GHCR on pushes to `main` (and on tags `v*`).

### Run via Docker

```bash
docker build -t xtrace-memory-support-agent .
docker run -p 3000:3000 \
  -e XTRACE_API_KEY=*** \
  -e XTRACE_ORG_ID=... \
  -e XTRACE_APP_ID=xtrace-memory-support-agent \
  xtrace-memory-support-agent
```

## Key design decisions

**Memory as belief revision, not vector retrieval.** This demo intentionally does not store entire chat transcripts as "memory". Instead, it relies on XTrace's extraction pipeline to produce structured memories (facts with `supersedes` links, episodes with `fact_ids`, artifacts with `source_fact_ids`) and XTrace's belief revision to keep the store clean as users correct themselves. This is the core differentiator.

**Episodes and artifacts show XTrace's depth.** Facts are the simplest memory type, but episodes (conversation summaries linking back to individual facts) and artifacts (structured documents derived from facts) demonstrate that XTrace is not a flat key-value store — it maintains a rich knowledge graph.

**Stateless mode has no side effects.** The agent only writes to memory in `with_memory` mode. `stateless` mode skips both retrieve and ingest, making the before/after comparison honest.

**Graceful degradation.** If XTrace returns a 429 (rate limit) or other API error, the agent still returns a reply — the error is surfaced in `writeResult.error` but the conversation is not blocked.

**IPv4 DNS fix.** Node's `undici` fetch resolves IPv6 first on some systems (WSL), which times out for `api.production.xtrace.ai`. The `xtrace-client.ts` injects a custom `fetch` that forces IPv4 via `node:https.Agent({ family: 4 })`.

See:
- `docs/pain-point.md`
- `docs/architecture.md`
- `docs/demo-script.md`
- `docs/sdk-features-tests.md`
