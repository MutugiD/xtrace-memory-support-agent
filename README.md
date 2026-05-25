# XTrace Memory Support Agent

A small Fastify + TypeScript demo that uses the **XTrace Memory API** to give a support agent durable, revisable customer context across sessions. The focus is on memory as **belief revision**, with **contradiction handling**, **provenance**, and **continuity** (not just retrieval over chat logs).

## What it demonstrates

- **Memory write pipeline:** every customer/agent turn is ingested via XTrace (`memories.ingest`).
- **Belief revision / contradictions:** changes surface as supersession (`memories_superseded_by`, `details.supersedes`).
- **Retrieval for continuity:** before responding, the agent retrieves XTrace's assembled `context_prompt` (`memories.retrieve`).
- **Provenance / timeline:** active + superseded + retracted facts with lineage (`supersedes` -> computed `replacedBy`).
- **Stateless vs memory-aware comparison:** shows the "cold start" vs "continuous context" difference immediately.

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
- `XTRACE_MOCK=1` (offline mode for local testing; does not call the live XTrace API)

### 3) Scripted demo (CLI)

```bash
npm run demo -- --reset
```

The scripted scenario includes a contradiction example (QuickBooks -> NetSuite) so you can observe supersession.

### 4) Run the web app

```bash
npm run dev
```

Open `http://localhost:3000/`.

### 5) Provenance / timeline (CLI)

```bash
npm run memory:timeline -- customer_123
```

## API

- `POST /api/chat`
  - body: `{ "userId", "convId", "message", "mode": "with_memory" | "stateless" }`
- `GET /api/memory/:userId`
  - returns active facts only
- `GET /api/memory/:userId/timeline`
  - returns all facts with `supersedes` + computed `replacedBy`
- `POST /api/demo/run`
  - runs scripted scenario
- `DELETE /api/demo/reset?userId=customer_123`
  - soft-deletes demo-scoped memories (scoped by `XTRACE_APP_ID`)

## Testing

```bash
npm test
```

Tests are unit-level and do not require network access.

## CI/CD

- CI: `.github/workflows/ci.yml` runs `npm ci`, `npm test`, and `npm run build` on PRs and on pushes to `main`.
- CD: `.github/workflows/docker.yml` builds and pushes a Docker image to GHCR on pushes to `main` (and on tags `v*`).

### Run via Docker

```bash
docker build -t xtrace-memory-support-agent .
docker run -p 3000:3000 \
  -e XTRACE_API_KEY=... \
  -e XTRACE_ORG_ID=... \
  -e XTRACE_APP_ID=xtrace-memory-support-agent \
  xtrace-memory-support-agent
```

