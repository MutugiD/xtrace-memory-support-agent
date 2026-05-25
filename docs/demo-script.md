# Demo script (reviewer-friendly)

## Setup

```bash
npm install
cp .env.example .env
# fill XTRACE_API_KEY and XTRACE_ORG_ID
```

## Run the scripted scenario

```bash
npm run demo -- --reset
```

You should see four sessions (`session_001`..`session_004`) and a comparison:

- “With XTrace memory”: response should reflect current plan + current contact preference.
- “Without memory”: response should ask onboarding questions again.

`session_004` includes an explicit contradiction demo (QuickBooks → NetSuite) so you can observe supersession in the timeline.

## Inspect provenance / timeline

```bash
npm run memory:timeline -- customer_123
```

Look for:

- a fact that is `SUPERSEDED` and a newer fact that supersedes it
- the `old -> new` chain

## Web UI

```bash
npm run dev
```

Open `http://localhost:3000/`:

- Use “New” to bump `conv_id` between sessions
- Switch mode to “Stateless” to see the cold start behavior
