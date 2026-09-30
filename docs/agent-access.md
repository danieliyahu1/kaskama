# Headless access

Kaskama's HTTP API is the product; the browser app is one client of it. The
agent guide is served as markdown at
[`/docs/agents.md`](https://kaskama.com/docs/agents.md), so a non-browser
client can fetch it the same way it fetches any other resource.

Read it at that URL. Its source lives at
`backend/src/adapters/http/agent-guide.ts`; this file only points there so the
prose is authored once. The guide covers wallet-signature authentication, the
two-step prepare/finalize payment protocol, the endpoint list, errors, and
concurrency rules.
