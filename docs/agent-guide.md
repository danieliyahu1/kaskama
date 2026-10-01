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
- Payment and membership `finalize` are idempotent per prepared id.
- Send an `Idempotency-Key` header on any write to make a retry replay the
  first result instead of acting twice; keys are scoped to your wallet.
- A `409` with `retry: "AFTER_REFRESH"` is not an error to retry blindly:
  re-read the resource, then decide.
