# SDK Feature Test Results

> Live XTrace API test results for the `xtrace-memory-support-agent` demo.
> Last run: 2026-05-26

## Test Environment

- **XTrace SDK**: `@xtraceai/memory` v0.1.1
- **Mode**: Live API (no mock)
- **Rate limits**: Free tier — 250 writes/day, 10 req/min
- **Throttle**: 8s between API calls to stay under the per-minute cap
- **Retry**: Exponential backoff on 429 (rate limit) responses

## Test Matrix

| # | Feature | XTrace SDK Method | What It Verifies | Result |
|---|---------|-------------------|------------------|--------|
| 1 | Belief Write | `memories.ingest()` | Ingesting a customer turn creates structured fact memories (plan, contact preference, issue, accounting system) | ✅ Pass |
| 2 | Retrieval | `memories.retrieve()` | The assembled `context_prompt` contains active facts and the correct plan/accounting info | ✅ Pass |
| 3 | Belief Revision | `memories.ingest()` | Correcting a fact (Pro→Enterprise, email→Slack) marks old facts as `superseded` and returns `memories_superseded_by` map | ✅ Pass |
| 4 | Provenance | `memories.list()` + `computeTimelineFromFacts()` | Timeline shows `supersedes` and computed `replacedBy` chains; old fact points to successor | ✅ Pass |
| 5 | Fact Lookup | `memories.get()` | Fetching a single fact by ID returns full details including `source_role`, `conv_id`, `status`, and `supersedes` | ✅ Pass |
| 6 | Revised Retrieval | `memories.retrieve()` | After revision, `context_prompt` reflects current facts (Enterprise, Slack), not stale ones (Pro, email) | ✅ Pass |
| 7 | User Isolation | `memories.list(filters)` | User A's facts (Enterprise, Slack) don't appear in User B's memory scope, and vice versa | ✅ Pass |
| 8 | Third Revision | `memories.ingest()` | QuickBooks→NetSuite migration produces third-order supersession chain | ✅ Pass |
| 9 | Final Timeline | `buildTimeline()` | Three sessions produce correct provenance depth: Pro→Enterprise, email→Slack, QuickBooks→NetSuite | ✅ Pass |
| 10 | Stateless Safety | `SupportAgent.handleChatTurn({ mode: "stateless" })` | Stateless mode returns empty `writeResult` (jobId="", createdCount=0) and does not write to memory | ✅ Pass |
| 11 | Memory-Aware Agent | `SupportAgent.handleChatTurn({ mode: "with_memory" })` | Agent retrieves context and incorporates it into the reply; ingest produces a valid job ID | ✅ Pass |

## Detailed Results Per Test

### 1. Belief Write

**Input**: Customer says "We are on the Pro plan. I prefer email updates. Our main issue is invoice reconciliation. We use QuickBooks."

**XTrace API call**: `memories.ingest({ user_id, conv_id, messages, app_id }, { wait: true })`

**Result**: XTrace extracted 4 structured facts:
- `customer.account.plan = Pro`
- `customer.contact_preference = email`
- `customer.current_issue = invoice reconciliation`
- `customer.accounting_system = QuickBooks`

The `ingest` job returned `status: "succeeded"` with `memories_created` containing 4 `MemoryRef` objects, each with `id`, `type: "fact"`, and `text` field.

**Stage timings** confirmed extraction pipeline stages (intent classification, fact extraction, deduplication).

### 2. Retrieval

**Input**: Query "What plan and accounting system does this customer use?"

**XTrace API call**: `memories.retrieve({ query, filters: { user_id, conv_id, app_id }, include: ["context_prompt"], limit: 12 })`

**Result**: Returned a `SearchListEnvelope` with:
- `data`: array of Memory objects matching active facts
- `extras.context_prompt`: assembled string containing relevant facts like "Plan: Pro" and "QuickBooks"

The `context_prompt` is XTrace's assembled context for LLM injection — it's not just keyword search, it's a structured summary of what the agent should know about this customer.

### 3. Belief Revision (Supersession)

**Input**: Customer says "Actually, we moved to Enterprise last week. Also don't email me anymore, use Slack."

**Result**: XTrace's second `ingest` call:
- Created 2 new facts: Enterprise plan, Slack contact preference
- Returned `memories_superseded_by: { old_plan_id: new_plan_id, old_contact_id: new_contact_id }`
- The old Pro and email facts were updated to `status: "superseded"` with their `details.supersedes` field pointing to the successor

This is the core differentiator: XTrace doesn't append duplicate notes. It identifies that "Enterprise" contradicts "Pro" and supersedes the old belief.

### 4. Provenance (Timeline)

**XTrace API call**: `memories.list({ user_id, app_id, type: "fact", order: "created_at_asc" })` (with `includeSuperseded: true`)

**Result after computeTimelineFromFacts()**:

```
[2026-05-25T08:10:00Z] (superseded) User is on the Pro plan.
  ↓ replacedBy: mem_enterprise_id
  ↑ supersedes: null

[2026-05-25T08:18:00Z] (active) User is on the Enterprise plan.
  ↑ supersedes: mem_pro_id
  ↓ replacedBy: null

[2026-05-25T08:10:00Z] (superseded) User prefers email updates.
  ↓ replacedBy: mem_slack_id

[2026-05-25T08:18:00Z] (active) User prefers Slack for updates.
  ↑ supersedes: mem_email_id
```

Every fact has full lineage: when it was created, what it superseded, and what superseded it.

### 5. Fact Lookup (getMemoryById)

**XTrace API call**: `memories.get(factId)`

**Result**: Returns the full Memory object with:
- `id`, `text`, `type: "fact"`
- `details.status`: "superseded" or "active"
- `details.supersedes`: id of the fact it replaced (or null)
- `details.source_role`: "user" (who said it)
- `details.fact_type`: XTrace's classification
- `conv_id`: the session that produced this fact
- `user_id`, `app_id`: scoping fields

This enables per-fact provenance queries in the UI — clicking any timeline row shows its complete audit trail.

### 6. Revised Retrieval

**After 2 sessions**: `memories.retrieve({ query: "current plan and contact preference" })`

The `context_prompt` contains "Enterprise" and "Slack" — the **revised** facts. The superseded "Pro" and "email" facts do not appear in the active context. This is exactly what a support agent needs: the current truth, not stale history.

### 7. User Isolation

**Setup**:
- User A: Enterprise, Slack, QuickBooks, invoice reconciliation
- User B: Starter plan, Xero

**XTrace API call**: `memories.list({ user_id: "user_b", app_id, type: "fact" })`

**Result**: User B sees only Starter and Xero facts. User A's Enterprise/Slack/QuickBooks facts are completely absent. The `user_id` + `app_id` scoping ensures no cross-contamination.

### 8. Third Revision (QuickBooks → NetSuite)

**Input**: "We no longer use QuickBooks. We migrated to NetSuite."

**Result**: XTrace created a new NetSuite fact and superseded the QuickBooks fact. The `memories_superseded_by` map confirmed the chain:
```
quickbooks_id → netsuite_id
```

This is a **third-order** supersession: it doesn't just replace, it extends the provenance chain. A future agent can see the full history: QuickBooks → NetSuite.

### 9. Final Timeline After 3 Sessions

```
Total: 7+ events, 3+ active, 3+ superseded

Session 1:
  Pro plan        → superseded by Enterprise (session 2)
  Email updates   → superseded by Slack (session 2)
  Invoice recon   → active
  QuickBooks      → superseded by NetSuite (session 4)

Session 2:
  Enterprise plan  → active, supersedes Pro
  Slack updates    → active, supersedes Email

Session 4:
  NetSuite         → active, supersedes QuickBooks
```

### 10. Stateless Safety

**`handleChatTurn({ mode: "stateless" })`** returns:
- `writeResult.jobId === ""`
- `writeResult.createdCount === 0`
- `writeResult.updatedCount === 0`
- `writeResult.supersededCount === 0`

Before and after the stateless turn, `listFacts()` returns the same count. No side effects.

### 11. Memory-Aware Agent

**`handleChatTurn({ mode: "with_memory" })`** for "Can you help with our invoice reconciliation setup?":

- `retrieved.contextPrompt` is populated with current context (Enterprise, Slack, NetSuite)
- `retrieved.memories.length >= 1`
- `writeResult.jobId` is a valid ingest job ID
- The agent reply references the customer's plan, contact preference, and accounting system

## Error Handling Results

### 429 Rate Limit

When the XTrace free tier daily write cap (250 units) was exceeded:

- **SupportAgent** caught the `RateLimited` error in `handleChatTurn()`
- The agent still returned a valid reply (deterministic template fallback)
- `writeResult.error` surfaced `{ statusCode: 429, code: "http_429", message: "Memory API daily write cap exceeded (250 units)..." }`
- The conversation was **not blocked** — graceful degradation

### IPv6 Timeout (WSL)

Node.js on WSL resolves `api.production.xtrace.ai` to IPv6 first, which times out. Fix: inject a custom `fetch()` into `MemoryClient` that uses `new https.Agent({ family: 4 })` to force IPv4 connections.

## Architecture Verified

```
Customer Message
       │
       ▼
  Intent Classifier ──► needsMemory()?
       │                       │
       │ yes                   │ no
       ▼                       ▼
  memories.retrieve()    skip retrieval
       │
       ▼
  Build prompt with context_prompt
       │
       ▼
  Generate reply (LLM or template)
       │
       ▼
  memories.ingest() [with_memory only]
       │
       ▼
  Return ChatTurnResult
       ├── reply
       ├── usedLlm
       ├── retrieved.contextPrompt
       ├── retrieved.memories
       └── writeResult (or error)
```

- **Ingest** only fires in `with_memory` mode
- **Retrieve** only fires when `needsMemory()` returns true
- **429 errors** are caught and surfaced, not thrown
- **IPv6** is handled at the network layer

## Unit Tests (No Network Required)

```
npm test  →  6 tests pass

✓ needsMemory skips trivial greetings
✓ needsMemory retrieves for substantive messages
✓ buildSupportPrompt includes memory block in with_memory mode
✓ buildSupportPrompt omits memory block when stateless
✓ computeTimelineFromFacts computes replacedBy by reversing supersedes
✓ support agent write result surfaces supersession events from ingest
```