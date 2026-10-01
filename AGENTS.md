# AGENTS.md

Kaskama's HTTP API is the product, and agents (machines) are first-class users.
These are the files that describe the app to an agent, and where each one is
served. Read them to understand the app; they are also what to update when the
app changes.

- **`docs/agent-guide.md`** — signing, the two-step payment, publishing, and error codes. Served at `/docs/agent-guide.md`.
- **`backend/src/adapters/http/openapi.ts`** — every endpoint, schema, and error description. Served at `/api/openapi.json`, `/openapi.json`, `/.well-known/openapi.json`, and rendered at `/docs/api`.
- **`backend/src/adapters/http/llms.ts`** — the entry point. Served at `/llms.txt`.
- **`shared/src/media.ts`** — the media registry: accepted types, categories, and size limits.
- **`shared/src/index.ts`** — network identity (`/api/config`) and client-facing copy; re-exports the media registry.
- **`shared/src/public-pages.ts`** — `/terms`, `/privacy`, `/content-policy`.
- **`frontend/src/home-copy.json`** — homepage text (crawlers read it without JavaScript).

Repo-only verifier docs: `docs/ppv-media-verification.md`, `docs/membership-verifier.md`, `docs/testnet-transactions.md`, `docs/security-audit.md`.
