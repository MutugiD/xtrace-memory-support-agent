# Pain point: support continuity without stale facts

Support workflows are the perfect place to demonstrate belief-aware memory:

- Customers change plans (Pro → Enterprise).
- Preferences change (email → Slack).
- Systems change (QuickBooks → NetSuite).

If “memory” is implemented as “retrieve old notes”, contradictions become duplicate notes. The agent then:

- picks the wrong version,
- asks repeat questions,
- or silently follows stale preferences.

XTrace’s core value proposition (and what this demo shows) is that remembered facts are **beliefs** with:

- lifecycle status (active/superseded/retracted),
- lineage (`supersedes` / replacement),
- provenance (linked to the session / conversation that created it),
- continuity across sessions without a cold start.

