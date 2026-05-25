# XTrace Memory Support Agent

Support teams lose customer context across tickets. Generic “memory” implementations (chat logs + vector search) can retrieve old notes, but they don’t reliably handle **when a fact changed**, **which fact is current**, or **why it changed**.

This demo uses the **XTrace Memory API** to build a memory-aware support agent that demonstrates:

- **Belief revision (supersede vs retract):** contradictions update the belief graph instead of piling up duplicates.
- **Provenance / timeline:** every remembered fact is traceable to the conversation session (`conv_id`) that produced it.
- **Continuity across sessions:** new sessions start with relevant context (no cold start).

## Why I built this

The hiring prompt asks applicants to build something using XTrace’s API/SDK and explain the pain point solved.

The pain point is extremely common in customer support:

- Agents ask the same onboarding questions every ticket.
- Agents silently use stale facts (plan, contact preference, systems) and give wrong guidance.
- There’s no audit trail for *why* the agent believed something.

## What this repo ships

- Fastify API server + minimal web UI
- XTrace-backed memory write pipeline (`ingest`) and retrieval (`retrieve` → `context_prompt`)
- Contradiction handling surfaced via `memories_superseded_by`
- Provenance / timeline view (active + superseded + retracted)
- “Stateless vs memory-aware” comparison mode
- Unit tests for the memory-specific logic (no network)

## Quickstart

### 1) Install

```bash
npm install
```

### 2) Configure environment

```bash
cp .env.example .env
```

Set:

- `XTRACE_API_KEY`
- `XTRACE_ORG_ID`

Optional:

- `OPENAI_API_KEY` (if omitted, replies are deterministic templates; memory behavior is still real)

### 3) Run scripted demo (CLI)

```bash
npm run demo -- --reset
```

The scripted demo includes a contradiction example (QuickBooks → NetSuite) so you can observe supersession.

### 4) Run the web app

```bash
npm run dev
```

Open `http://localhost:3000/`.

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

## API

- `POST /api/chat`
  - body: `{ "userId", "convId", "message", "mode": "with_memory" | "stateless" }`
- `GET /api/memory/:userId`
  - returns active facts only
- `GET /api/memory/:userId/timeline`
  - returns all facts with `supersedes` + computed `replacedBy`
- `POST /api/demo/run`
  - runs 3-session scripted scenario
- `DELETE /api/demo/reset?userId=customer_123`
  - soft-deletes demo-scoped memories (scoped by `XTRACE_APP_ID`)

## Provenance / Timeline (CLI)

```bash
npm run memory:timeline -- customer_123
```

## Notes on “memory hygiene”

This demo intentionally does **not** store entire chat transcripts as “memory”. Instead, it relies on XTrace’s extraction pipeline to produce structured memories (facts/episodes/artifacts) and XTrace’s belief revision to keep the store clean as users correct themselves.

See:

- `docs/pain-point.md`
- `docs/architecture.md`
- `docs/demo-script.md`
