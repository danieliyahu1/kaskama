# Headless access

Kaskama is a subscription platform where creators sell access to their work,
and its HTTP API is the product. An agent that holds a Kaspa key can do
everything the app does, with no browser. Identity is wallet ownership: you
prove it by signing a server-issued challenge, and every request is scoped to
that wallet.

There is no agent-specific account, token, or permission — identity is the
wallet, and the same API serves every client.

## Prerequisites

Bring your own Kaspa keypair. Kaskama never issues a key, account, or token —
the wallet's key is the identity. Create and sign with any Kaspa SDK; for a
headless client, `kaspa-wasm` provides `Keypair`, `PrivateKey`, and
`signMessage` — see [Kaspa's developer resources](https://kaspa.org/build).

Derive the address on the network the server reports, so the prefix always
matches:

```ts
const address = keypair.toAddress(config.network).toString();
```

`GET /api/config` returns that network; you never choose one:

```json
{
  "network": "mainnet",
  "walletNetwork": "kaspa_mainnet",
  "addressPrefix": "kaspa"
}
```

The same key signs the authentication challenge and the prepared payment.
Authentication is free; paying is the only step that spends KAS.

## Authentication

The only credential is a signature over a server-issued, single-use challenge.

1. **Ask for a challenge.**

```http
POST /api/auth/challenge
Content-Type: application/json

{ "address": "kaspa:..." }
```

```json
{
  "challengeId": "...",
  "message": "Connect to Kaskama. ...\nNonce: ...",
  "expiresAt": "..."
}
```

2. **Sign `message` verbatim** with the wallet's private key.

3. **Exchange it for a session token.**

```http
POST /api/auth/session
Content-Type: application/json

{ "challengeId": "...", "address": "kaspa:...", "publicKey": "00...", "signature": "00..." }
```

```json
{ "token": "...", "address": "kaspa:...", "expiresAt": "..." }
```

4. **Send the token on every subsequent request.**

```http
Authorization: Bearer <token>
```

`GET /api/auth/session` returns the current identity, and
`POST /api/auth/logout` revokes the token.

The signature is a standard Kaspa message signature (Schnorr) over `message`,
encoded as hex or base64; `publicKey` is the wallet's x-only public key.

## Paying and subscribing

Money moves in two steps so a client never holds state between them:

1. `POST .../prepare` returns an unsigned transaction and an id.
2. The client signs it locally.
3. `POST .../finalize` submits the signed transaction.

`prepare` returns the transaction as Safe JSON. Sign it with the key from
Prerequisites and change nothing else — the server rejects a transaction that
differs from the prepared template:

- **A post payment** leaves every input yours and unsigned, so sign them all
  with `SIGHASH_ALL`.
- **A subscription** returns a `signInputs` list of the indices to sign. The
  server has already signed the covenant inputs; leave those inputs exactly as
  they are.

`finalize` returns:

| Status | Body                                    | Meaning                                               |
| ------ | --------------------------------------- | ----------------------------------------------------- |
| `201`  | `{ state: "CONFIRMED", transactionId }` | Paid and recorded.                                    |
| `202`  | `{ state: "PENDING", transactionId }`   | On chain but not confirmed yet. **Do not pay again.** |
| `422`  | `{ state: "REJECTED", rejection }`      | Rejected. Nothing was charged.                        |

## Checkout and subscriptions

A creator can sell a 30-day subscription as well as one-off posts. The offer
lives on chain as a covenant the creator owns, and `GET /api/creators/{address}`
reports it. The browser checkout page at `/checkout/<creator-wallet>` is one
client of the same endpoints — there is nothing a buyer can do there that you
cannot do with the API.

Two roles, one flow; every step uses the same `prepare -> sign -> finalize` and
the same three finalize outcomes:

| Step           | Who     | Endpoints                                                                                             |
| -------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| Read a creator | anyone  | `GET /api/creators/{address}`                                                                          |
| Open the offer | creator | `POST /api/membership/offers/prepare` then `POST /api/membership/offers/{id}/finalize`                 |
| Subscribe      | buyer   | `POST /api/membership/{creator}/prepare` then `POST /api/membership/purchases/{id}/finalize`           |
| Change price   | creator | `POST /api/membership/price/prepare` then `POST /api/membership/price/{id}/finalize`                   |
| Close offer    | creator | `POST /api/membership/cancel/prepare` then `POST /api/membership/cancel/{id}/finalize`                 |

The price is the creator's, but the chain enforces the terms, so they hold for
any client: a minimum and maximum price, and a 1% platform fee with a floor. The
running server states the exact numbers in `/api/openapi.json` — they are
generated from the covenant, not typed by hand, so read them there.

### Read an offer before you pay

`GET /api/creators/{address}` answers three different questions, and the answers
can disagree:

- `offered` — the server has a subscription row for this creator.
- `available` — the offer is live on chain right now. Re-check it before buying:
  an offer can be listed while the chain cannot serve it.
- `active` — the wallet making this request holds an unexpired membership.

Subscribe only when `offered` and `available` are both true. The response also
carries `covenantId` when an offer exists.

### Membership errors

Besides the shared codes, a subscription can fail with:

| Code                          | Status | Meaning                                                              |
| ----------------------------- | ------ | -------------------------------------------------------------------- |
| `INVALID_MEMBERSHIP_PRICE`    | `400`  | The price failed the format, floor, or ceiling check.                 |
| `MEMBERSHIP_OFFER_EXISTS`     | `409`  | The creator already has a live offer.                                 |
| `MEMBERSHIP_OFFER_STALE`      | `409`  | The covenant moved while you worked; carries `retry: AFTER_REFRESH`.  |
| `MEMBERSHIP_SUBMISSION_FAILED`| `502`  | The network refused the signed transaction. Nothing was charged.      |
| `MEMBERSHIP_UNAVAILABLE`      | `503`  | The subscription service is not wired on this server.                 |

The `*_NOT_FOUND` variants (`OFFER`, `PRICE_UPDATE`, `CANCELLATION`,
`PURCHASE`) are `404` — the prepared id expired or belongs to another wallet.
`MEMBERSHIP_CANCELLATION_STALE`, `MEMBERSHIP_PRICE_UPDATE_STALE`, and
`MEMBERSHIP_PURCHASE_EXISTS` follow the same retry rules as `MEMBERSHIP_OFFER_STALE`
and the other `409`s.

## Referrals

Any post or creator page can be shared with a `?ref=<wallet>` query parameter.
A visitor who lands through one of those links has that wallet remembered in a
`kaskama_ref` cookie for 24 hours; a purchase made within that window credits it.

The credit is paid in the same transaction as the purchase, out of the platform
fee - the creator's payout is never reduced. The referrer receives half the
platform fee and the platform keeps the other half. The fee is 1% and only
charged once it reaches 1 KAS, so a referral is paid only when both halves are
at least 1 KAS: when the fee is exactly 1 KAS there is nothing to split, no
referrer output is built, and the platform keeps the whole fee.

The attribution lives inside the payment: the signed transaction names the
referrer in its payload and carries the referrer's share as its own output, so
the split can be verified from the chain alone. There is no account, no balance,
and no payout system, and nothing about the referrer is stored on the server.

A headless client credits a wallet by naming it when preparing the payment:

```http
POST /api/posts/{id}/payments/prepare
Content-Type: application/json

{ "referrer": "kaspa:..." }
```

`referrer` is optional and equally optional to every client. An address that is
not valid on the server's network is ignored, so a bad link never blocks a sale.

## Endpoints

The endpoints, their request and response schemas, and which of them need the
bearer token live in one place: the OpenAPI document at
[`/api/openapi.json`](/api/openapi.json). This guide covers the flow those
schemas cannot: signing, the two-step payment, and retry safety.

## Publishing

Publishing is free. `POST /api/posts/publish` is a normal multipart form, and
`price` is what a buyer pays to unlock the post:

- `caption`: text, 1-280 characters.
- `price`: decimal KAS, up to 8 decimal places; `0` publishes it free for
  everyone.
- `media`: one JPEG, PNG, WebP, MP4, WebM, MP3, or PDF file (images up to
  25 MB, videos up to 100 MB, audio and documents up to 25 MB).

Publishing the same bytes twice returns `409` with the existing `id`, so a retry
is safe.

## Errors

Every failure uses one envelope:

```json
{ "error": "CODE", "message": "...", "requestId": "...", "retry": "AFTER_REFRESH" }
```

`error` is stable and machine-readable. `requestId` correlates with server logs.
`retry: "AFTER_REFRESH"` means the resource changed underneath you: refetch it,
then you may submit again. Known codes include `AUTHENTICATION_REQUIRED`,
`INVALID_ADDRESS`, `POST_NOT_FOUND`, `ALREADY_UNLOCKED`, `INSUFFICIENT_FUNDS`,
`PAYMENT_NOT_FOUND`, `INVALID_REQUEST`, `RATE_LIMITED`, and the media codes
`INVALID_MEDIA`, `UNSUPPORTED_MEDIA`, `IMAGE_TOO_LARGE`, `VIDEO_TOO_LARGE`,
`AUDIO_TOO_LARGE`, `DOCUMENT_TOO_LARGE`, `MEDIA_ALREADY_PUBLISHED`, and
`MEDIA_FORBIDDEN`.

## Concurrency

- `prepare` results expire; finalize promptly.
- Payment and membership `finalize` are idempotent per prepared id, so a retry
  returns the same outcome instead of charging twice.
- A repeated `prepare` is harmless: nothing is signed or paid until you
  finalize, so it just issues a fresh template.
- A `409` with `retry: "AFTER_REFRESH"` is not an error to retry blindly:
  re-read the resource, then decide.

## Community and feedback

The same channels the site footer shows are open to any client:

- Telegram: <https://t.me/+KHxAIuAXrng4Y2I0>
- GitHub: <https://github.com/danieliyahu1/kaskama>

Send feedback or report content with an anonymous, unauthenticated request:

```http
POST /api/feedback
Content-Type: application/json

{ "message": "..." }
```

`message` is 1-1500 characters and the endpoint returns `202`. It is rate-limited
to five submissions per ten minutes per client, and a `429` carries `Retry-After`.
