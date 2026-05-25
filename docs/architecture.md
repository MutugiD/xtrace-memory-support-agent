# Architecture

This repo is intentionally small but structured like a production demo:

```text
UI (static) / CLI
   |
   v
Fastify API
   |
   |-- SupportAgent (orchestrator)
   |     |-- intent-classifier (skip memory for trivial turns)
   |     |-- MemoryService.retrieveContext()  -> XTrace memories.retrieve() (context_prompt)
   |     |-- response-generator (LLM or deterministic fallback)
   |     |-- MemoryService.ingestTurn()       -> XTrace memories.ingest() (belief revision)
   |
   |-- MemoryService
         |-- listFacts() / buildTimeline()
         |-- resetUser() (soft delete in app scope)
```

## Key idea: memory write path > memory read path

The demo leans into XTrace’s positioning:

- The **write path** extracts structured facts and performs belief revision (supersede/retract).
- The **read path** retrieves only what’s active and relevant, packaged as a `context_prompt` for agent continuity.

