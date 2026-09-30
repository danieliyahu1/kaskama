# Headless access

Kaskama's HTTP API is the product; the browser app is one client of it. Any
program that controls a Kaspa wallet can do everything a person can do in the
app, without a browser. Identity is wallet ownership: you prove it by signing a
server-issued challenge, and every request is scoped to that wallet.

There is no agent-specific account, token, or permission. If a person can do it,
a machine can do it, the same way.

## Prerequisites

- A Kaspa private key. Development runs on `testnet-10`; production runs on
  `mainnet`. The key's address prefix must match the network.
- `GET /api/config` returns the network the server is on:

```json
{
  "network": "testnet-10",
  "walletNetwork": "kaspa_testnet_10",
  "addressPrefix": "kaspatest"
}
```

The server tells you the network; you never choose one. Sign on the network the
server reports.

## Authentication

The only credential is a signature over a server-issued, single-use challenge.

1. **Ask for a challenge.**

```http
POST /api/auth/challenge
Content-Type: application/json

{ "address": "kaspatest:..." }
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

{ "challengeId": "...", "address": "kaspatest:...", "publicKey": "00...", "signature": "00..." }
```

```json
{ "token": "...", "address": "kaspatest:...", "expiresAt": "..." }
```

4. **Send the token on every subsequent request.**

```http
Authorization: Bearer <token>
```

The same token is also set as an `HttpOnly` cookie for browsers; a bearer header
wins when both are present. `GET /api/auth/session` returns the current identity,
and `POST /api/auth/logout` revokes the token.

The signature is a standard Kaspa message signature (Schnorr) over `message`,
encoded as hex or base64; `publicKey` is the wallet's x-only public key. Any
Kaspa SDK can produce it — for example `kaspa-wasm`'s `signMessage` /
`verifyMessage` pair.

## Paying and subscribing

Money moves in two steps so a client never holds state between them:

1. `POST .../prepare` returns an unsigned transaction and an id.
2. The client signs it locally.
3. `POST .../finalize` submits the signed transaction.

```ts
const prepared = await post(`/api/posts/${postId}/payments/prepare`);
const signedTransaction = signTransaction(prepared.transaction, privateKey);
const result = await post(`/api/payments/${prepared.id}/finalize`, {
  signedTransaction,
});
```

`finalize` returns:

| Status | Body                                    | Meaning                                               |
| ------ | --------------------------------------- | ----------------------------------------------------- |
| `201`  | `{ state: "CONFIRMED", transactionId }` | Paid and recorded.                                    |
| `202`  | `{ state: "PENDING", transactionId }`   | On chain but not confirmed yet. **Do not pay again.** |
| `422`  | `{ state: "REJECTED", rejection }`      | Rejected. Nothing was charged.                        |

The client signs only the inputs the server left unsigned — the empty
`signatureScript`s. Covenant inputs the server already signed must be copied
through unchanged, and every other field of the transaction preserved exactly;
the server rejects a transaction that differs from the prepared template.

## Endpoints

| Method | Path                                      | Auth     | Notes                                               |
| ------ | ----------------------------------------- | -------- | --------------------------------------------------- |
| GET    | `/api/config`                             | no       | Network identity.                                   |
| GET    | `/api/auth/session`                       | optional | Current identity.                                   |
| POST   | `/api/auth/logout`                        | optional | Revoke the token.                                   |
| GET    | `/api/profile`                            | yes      | Own profile.                                        |
| PUT    | `/api/profile`                            | yes      | `{ displayName?, isPublic? }`.                      |
| GET    | `/api/creators/public`                    | no       | Public creators.                                    |
| GET    | `/api/creators/search?q=`                 | no       | Creator search.                                     |
| GET    | `/api/creators/:address`                  | optional | Creator, posts, membership, unlocks.                |
| GET    | `/api/posts/:id`                          | optional | Post metadata.                                      |
| GET    | `/api/posts/:id/preview`                  | no       | Blurred preview image.                              |
| GET    | `/api/posts/:id/media`                    | paid     | Full media; supports `Range`.                       |
| POST   | `/api/posts/publish`                      | yes      | `multipart/form-data`: `caption`, `price`, `media`. |
| DELETE | `/api/posts/:id`                          | yes      | Delete own post.                                    |
| POST   | `/api/posts/:id/payments/prepare`         | yes      | Buy a post.                                         |
| POST   | `/api/payments/:id/finalize`              | yes      | Submit the signed payment.                          |
| POST   | `/api/membership/:creator/prepare`        | yes      | Subscribe.                                          |
| POST   | `/api/membership/purchases/:id/finalize`  | yes      | Submit the signed subscription.                     |
| POST   | `/api/membership/offers/prepare`          | yes      | Creator: start an offer.                            |
| POST   | `/api/membership/offers/:id/finalize`     | yes      | Creator: submit the offer.                          |
| POST   | `/api/membership/price/prepare`           | yes      | Creator: change price.                              |
| POST   | `/api/membership/price/:id/finalize`      | yes      | Creator: submit the change.                         |
| POST   | `/api/membership/cancel/prepare`          | yes      | Creator: cancel.                                    |
| POST   | `/api/membership/cancel/:id/finalize`     | yes      | Creator: submit the cancellation.                   |
| GET    | `/api/verify/membership/address/:address` | no       | Membership status from chain.                       |
| GET    | `/api/verify/membership/utxo/:tx/:index`  | no       | Check one covenant output.                          |
| POST   | `/api/feedback`                           | no       | Short feedback message.                             |

## Publishing

`POST /api/posts/publish` is a normal multipart form:

- `caption`: text, 1-280 characters.
- `price`: decimal KAS, up to 8 decimal places (`0` is a free post).
- `media`: one JPEG, PNG, WebP, MP4, or WebM file (images up to 25 MB, videos up
  to 100 MB).

Publishing the same bytes twice returns `409` with the existing `id`, so a retry
is safe. Publishing is free; the post's price is paid by buyers.

## Errors

Every failure uses one envelope:

```json
{ "error": "CODE", "message": "...", "requestId": "...", "retry": "AFTER_REFRESH" }
```

`error` is stable and machine-readable. `requestId` correlates with server logs.
`retry: "AFTER_REFRESH"` means the resource changed underneath you: refetch it,
then you may submit again. Known codes include `AUTHENTICATION_REQUIRED`,
`INVALID_ADDRESS`, `POST_NOT_FOUND`, `ALREADY_UNLOCKED`, `INSUFFICIENT_FUNDS`,
`PAYMENT_NOT_FOUND`, `MEDIA_ALREADY_PUBLISHED`, `INVALID_REQUEST`, and
`RATE_LIMITED`.

## Concurrency

- `prepare` results expire; finalize promptly.
- Payment and membership `finalize` are idempotent per prepared id.
- A `409` with `retry: "AFTER_REFRESH"` is not an error to retry blindly:
  re-read the resource, then decide.
