# On-chain membership verification

Kaskama memberships are SilverScript covenant UTXOs on Kaspa testnet-10. The
verifier determines membership from chain data alone. Database membership rows
and descriptive transaction fields are not authorization sources.

## Discovery

Kaspa identifies a covenant by its `covenant_id`, but the public node exposes no
reverse index from an address to a covenant. Kaskama therefore records the
covenant handle — its `covenant_id` and the member output outpoint — on the
membership receipt when a purchase settles, and discovery starts from that
record.

For each receipt for an address, the verifier loads the mint transaction and
requires the member covenant output at index `1` to pass the covenant validation
below. The returned `MembershipCheck.outputIndex` identifies the covenant output.
Discovery never depends on a wallet coin, so spending the wallet cannot hide a
live membership.

## Covenant validation

A membership is recognized only when all of these checks pass:

- the transaction has version `1`;
- its hex payload decodes to JSON with protocol `kaskama`, version `1`, and
  token type `membership`;
- the payload reveals `memberRedeemScript`;
- the redeem script matches the compiled SilverScript template and decodes to
  non-minter state;
- hashing that redeem script produces the covenant output's P2SH script;
- the output has a consensus covenant ID, matching `expectedCovenantId` when
  one is supplied;
- the output is authorized by covenant input `0`;
- the owner public key in covenant state derives the reported testnet-10
  address;
- the creator public key in state matches the creator whose offer is checked;
- the covenant output still appears in the UTXO set for its P2SH address.

The last check prevents a spent token from remaining valid.

The verifier trusts the contract once it is on chain. The covenant enforces the
payment amounts, platform address, and lifetime at mint time; the verifier does
not re-check them. The reported owner, creator, platform, and expiry come from
covenant state.

## Creator-scoped discovery

Access checks resolve a subscription for one creator at a time. The access use
case checks stored receipts and verifies each recorded covenant output on chain.
Because the public node has no address-to-covenant index, there is no chain-only
scan: a membership is only discoverable from the handle recorded at mint time. A
membership that was never recorded must be found by its outpoint via the UTXO
endpoint.


## Status semantics

The verifier reads `virtualDaaScore` from `GET /info/blockdag` and compares it
with the expiry committed in covenant state.

| Status | Meaning |
| --- | --- |
| `VALID` | The covenant is recognized, unspent, owned by the expected address when supplied, and its expiry DAA is in the future. |
| `EXPIRED` | The covenant is recognized and unspent, but current DAA is at or beyond its expiry. |
| `OWNER_MISMATCH` | The covenant is recognized and unspent, but its state owner differs from `expectedOwner`. |
| `NOT_MEMBERSHIP` | Any template, script, covenant ID, lifetime, or unspent check fails. |

The `kaskama` payload contains the platform address, membership output index,
and creation/expiry DAA values. The verifier cross-checks every machine-readable
value against covenant state before exposing the metadata. `createdAt` and
`validUntil` remain ISO display estimates; DAA values are the authoritative
values.

## HTTP API

Both endpoints are public and unauthenticated.

```text
GET /api/verify/membership/address/:address[?owner=<kaspatest:...>]
GET /api/verify/membership/utxo/:transactionId/:outputIndex[?owner=<kaspatest:...>]
```

The address endpoint returns every checked pointer candidate and sets `valid`
when at least one result is `VALID`. The UTXO endpoint checks the specified
covenant output directly.

Errors are `400 INVALID_ADDRESS`, `400 INVALID_REQUEST`, or
`503 VERIFY_UNAVAILABLE` when no verifier is configured.

## CLI

```text
pnpm --filter @kaskama/backend verify:membership utxo <transactionId> <outputIndex> [--owner <address>] [--node <url>]
```

The CLI verifies a single covenant output. Address-wide discovery needs the
recorded covenant handle, so it is served by the HTTP API, not the chain-only
CLI.

The default node is `https://api-tn10.kaspa.org`. `backend/src/server.ts`
constructs `KaspaMembershipVerifier` using `KASPA_NODE_URL` and injects it into
the application.
