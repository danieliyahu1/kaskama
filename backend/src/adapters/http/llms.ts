/**
 * The agent entry point served at `/llms.txt`. It is a plain-text map of the
 * site for non-browser clients: what Kaskama is, where the contract lives, and
 * the few rules that a machine must know. People and agents read the same
 * contract; this document only changes the format, never the access.
 */
export function llmsTxt(origin: string): string {
  const link = (path: string) => new URL(path, origin).toString();

  return [
    "# Kaskama",
    "",
    "> Kaskama is a subscription platform where creators sell access to their",
    "> work. The HTTP API is the product; the browser app is one client of it.",
    "> There is no agent-specific account, token, or permission: if a person can",
    "> do it, a machine can do it, the same way.",
    "",
    "Identity is wallet ownership. Prove it by signing a server-issued challenge,",
    "and every request is scoped to that wallet. The server reports the network it",
    "runs on; never choose one yourself.",
    "",
    "## Contract",
    "",
    `- [HTTP API reference](${link("/docs/api")}): the rendered contract.`,
    `- [Agent guide](${link("/docs/agent-guide.md")}): signing, payments, and the rules as markdown.`,
    `- [OpenAPI document](${link("/api/openapi.json")}): the same contract as JSON.`,
    `- [Network identity](${link("/api/config")}): the chain the server is on.`,
    "",
    "## Authentication",
    "",
    "The only credential is a signature over a server-issued, single-use challenge.",
    "",
    `1. \`POST ${link("/api/auth/challenge")}\` with \`{ "address": "kaspa:..." }\`.`,
    "2. Sign the returned `message` verbatim with the wallet's private key",
    "   (Schnorr, hex or base64; `publicKey` is the x-only key).",
    `3. \`POST ${link("/api/auth/session")}\` with \`{ challengeId, address,`,
    "   publicKey, signature }`; it returns a `token`.",
    "4. Send `Authorization: Bearer <token>` on every later request.",
    "",
    "A browser receives the same token as an `HttpOnly` cookie; a bearer header",
    "wins when both are present. `POST /api/auth/logout` revokes it.",
    "",
    "## Paying and subscribing",
    "",
    "Money moves in two steps so a client never holds state between them:",
    "`POST .../prepare` returns an unsigned transaction and an id; the client signs",
    "it locally; `POST .../finalize` submits it. `finalize` returns `201 CONFIRMED`,",
    "`202 PENDING` (on chain, not confirmed yet - do not pay again), or",
    "`422 REJECTED` (nothing was charged).",
    "",
    "## Errors",
    "",
    'Every failure uses one envelope: `{ "error": "CODE", "message": "...",',
    '"requestId": "...", "retry": "AFTER_REFRESH" }`. `error` is stable and',
    'machine-readable. `retry: "AFTER_REFRESH"` means the resource changed',
    "underneath you: refetch it, then submit again.",
    "",
    "## Optional",
    "",
    `- [Sitemap](${link("/sitemap.xml")})`,
    `- [Robots](${link("/robots.txt")})`,
    "",
  ].join("\n");
}
