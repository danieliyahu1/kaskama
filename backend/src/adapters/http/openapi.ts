import {
  AGENT_GUIDE_PATH,
  API_DOCS_PATH,
  MEDIA_TYPES,
  OPENAPI_PATH,
} from "@kaskama/shared";
import { MEDIA_ERROR_CATEGORIES } from "../media/media.js";

/**
 * The public HTTP contract. This is the product surface: the browser app, an
 * agent, or any script all speak it. It is authored once here so it can be
 * served, rendered, and tested in one place.
 */
export function openApiDocument(origin: string): Record<string, unknown> {
  const errorEnvelope = {
    type: "object",
    required: ["error", "message", "requestId"],
    properties: {
      error: { type: "string", description: "Stable, machine-readable code." },
      message: { type: "string", description: "Human-readable explanation." },
      requestId: { type: "string", description: "Correlates with server logs." },
      retry: {
        type: "string",
        description: "Present when the caller should refetch before retrying.",
        enum: ["AFTER_REFRESH"],
      },
    },
  } as const;

  const json = (schema: Record<string, unknown> | { $ref: string }) => ({
    "application/json": { schema },
  });
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
  const errorResponses = {
    400: { description: "Invalid request.", content: json(ref("Error")) },
    401: { description: "Authentication required.", content: json(ref("Error")) },
    403: { description: "Forbidden.", content: json(ref("Error")) },
    404: { description: "Not found.", content: json(ref("Error")) },
    409: { description: "Conflict or stale state.", content: json(ref("Error")) },
    422: { description: "Rejected.", content: json(ref("Error")) },
    502: {
      description: "The network refused the signed transaction.",
      content: json(ref("Error")),
    },
    503: { description: "Upstream unavailable.", content: json(ref("Error")) },
  };

  const idempotencyHeader = {
    name: "Idempotency-Key",
    in: "header",
    required: false,
    schema: { type: "string" },
    description:
      "Retry-safe writes: if the same key arrives again on the same path, the first response is replayed instead of acting twice. Keys are scoped to the calling wallet.",
  };
  // `false` opts a public operation out of the root requirement; an array
  // declares an override, such as `optionalAuth` for a call that works signed
  // in or anonymous.
  const securityField = (security?: boolean | Record<string, unknown>[]) =>
    security === false
      ? { security: [] }
      : Array.isArray(security)
        ? { security }
        : {};
  // Signed in or anonymous: the response is scoped to the wallet when one is
  // presented, and still useful without one.
  const optionalAuth = [{ bearerAuth: [] }, {}];
  const post = (
    summary: string,
    options: {
      security?: boolean | Record<string, unknown>[];
      body?: Record<string, unknown>;
      /** When false, a request body may be omitted entirely. */
      bodyRequired?: boolean;
      response?: { status: string; schema: Record<string, unknown> | { $ref: string } };
      parameters?: Record<string, unknown>[];
    },
  ) => ({
    summary,
    parameters: [idempotencyHeader, ...(options.parameters ?? [])],
    ...securityField(options.security),
    ...(options.body
      ? {
          requestBody: {
            required: options.bodyRequired !== false,
            content: json(options.body),
          },
        }
      : {}),
    responses: {
      ...(options.response
        ? {
            [options.response.status]: {
              description: "Success.",
              content: json(options.response.schema),
            },
          }
        : {}),
      ...errorResponses,
    },
  });

  const get = (
    summary: string,
    options: {
      security?: boolean | Record<string, unknown>[];
      response: { status: string; schema: Record<string, unknown> | { $ref: string } };
      parameters?: Record<string, unknown>[];
      binary?: boolean;
    },
  ) => ({
    summary,
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...securityField(options.security),
    responses: {
      [options.response.status]: options.binary
        ? { description: "Success.", content: { "application/octet-stream": {} } }
        : {
            description: "Success.",
            content: json(options.response.schema),
          },
      ...errorResponses,
    },
  });

  const pathParam = (name: string, description: string) => ({
    name,
    in: "path",
    required: true,
    schema: { type: "string" },
    description,
  });
  const queryParam = (name: string, description: string, required = false) => ({
    name,
    in: "query",
    required,
    schema: { type: "string" },
    description,
  });
  const tokenBody = {
    type: "object",
    required: ["signedTransaction"],
    properties: { signedTransaction: { type: "string" } },
  };
  // A finalize answers with the money outcome, not the generic error envelope:
  // 201 confirmed, 202 submitted-but-unconfirmed (do not pay again), 422
  // rejected with nothing charged. 409 still uses the error envelope.
  const finalizeSubmission = (summary: string, idDescription: string) => ({
    summary,
    parameters: [idempotencyHeader, pathParam("id", idDescription)],
    requestBody: { required: true, content: json(tokenBody) },
    responses: {
      "201": {
        description: "Confirmed and recorded.",
        content: json(ref("SubmissionResult")),
      },
      "202": {
        description: "On chain but not confirmed yet. Do not submit again.",
        content: json(ref("SubmissionResult")),
      },
      ...errorResponses,
      "422": {
        description: "Rejected. Nothing was charged.",
        content: json(ref("SubmissionResult")),
      },
    },
  });

  return {
    openapi: "3.1.0",
    info: {
      title: "Kaskama API",
      version: "0.1.0",
      description: [
        "Kaskama's HTTP API is the product; the browser app is one client of it.",
        "Identity is wallet ownership: sign a server-issued challenge, then send the",
        "returned token as `Authorization: Bearer`. There is no agent-specific",
        "account, token, or permission.",
      ].join(" "),
    },
    servers: [{ url: origin }],
    // Every operation requires the bearer token unless it opts out.
    security: [{ bearerAuth: [] }],
    externalDocs: {
      url: `${origin}${AGENT_GUIDE_PATH}`,
      description: "Headless access and the signing protocol.",
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
      schemas: {
        Error: errorEnvelope,
        NetworkConfig: {
          type: "object",
          properties: {
            network: { type: "string", enum: ["mainnet", "testnet-10"] },
            walletNetwork: { type: "string" },
            addressPrefix: { type: "string" },
          },
        },
        Profile: {
          type: "object",
          properties: {
            address: { type: "string" },
            displayAddress: { type: "string" },
            displayName: { type: ["string", "null"] },
            bio: { type: ["string", "null"] },
            avatarUrl: { type: ["string", "null"] },
            isPublic: { type: "boolean" },
          },
        },
        CurrentSession: {
          type: "object",
          properties: {
            address: { type: "string" },
            displayName: { type: ["string", "null"] },
            expiresAt: { type: "string" },
          },
        },
        CreatorSearchResult: {
          type: "object",
          properties: {
            address: { type: "string" },
            displayAddress: { type: "string" },
            displayName: { type: ["string", "null"] },
            bio: { type: ["string", "null"] },
            avatarUrl: { type: ["string", "null"] },
            lastPostedAt: { type: ["string", "null"] },
            membership: {
              type: "object",
              properties: {
                offered: { type: "boolean" },
                priceSompi: { type: ["string", "null"] },
                durationDays: { type: "integer" },
              },
            },
          },
        },
        Post: {
          type: "object",
          properties: {
            id: { type: "string" },
            creator: { type: "string" },
            caption: { type: "string" },
            priceSompi: { type: "string" },
            mediaType: {
              type: "string",
              enum: [...MEDIA_TYPES],
              description: "MIME type of the post's media.",
            },
            publishedAt: { type: "string" },
            canView: { type: "boolean" },
          },
        },
        Creator: {
          type: "object",
          properties: {
            address: { type: "string" },
            displayAddress: { type: "string" },
            displayName: { type: ["string", "null"] },
            bio: { type: ["string", "null"] },
            avatarUrl: { type: ["string", "null"] },
            isPublic: { type: "boolean" },
            isOwner: { type: "boolean" },
            membership: {
              type: "object",
              properties: {
                offered: { type: "boolean" },
                canceled: { type: "boolean" },
                active: { type: "boolean" },
                priceSompi: { type: ["string", "null"] },
                durationDays: { type: "integer" },
              },
            },
            posts: { type: "array", items: ref("Post") },
          },
        },
        PreparedPayment: {
          type: "object",
          properties: {
            id: { type: "string" },
            transaction: {
              type: "string",
              description: "An unsigned transaction JSON the client signs.",
            },
            amountSompi: { type: "string" },
          },
        },
        PreparedMembership: {
          type: "object",
          properties: {
            id: { type: "string" },
            transaction: {
              type: "string",
              description: "An unsigned transaction JSON the client signs.",
            },
            signInputs: {
              type: "array",
              items: { type: "integer" },
              description:
                "Input indices the client must sign; the server already signed the covenant inputs.",
            },
          },
        },
        SubmissionResult: {
          type: "object",
          properties: {
            state: { type: "string", enum: ["CONFIRMED", "PENDING", "REJECTED"] },
            transactionId: { type: ["string", "null"] },
            covenantId: { type: ["string", "null"] },
            rejection: { type: ["string", "null"] },
            message: { type: "string" },
          },
        },
        MembershipCheck: {
          type: "object",
          properties: {
            transactionId: { type: "string" },
            outputIndex: { type: "integer" },
            covenantId: { type: ["string", "null"] },
            kind: { type: "string", enum: ["token", "none"] },
            tokenType: { type: ["string", "null"] },
            owner: { type: ["string", "null"] },
            contentCreator: { type: ["string", "null"] },
            platformAddress: { type: ["string", "null"] },
            status: {
              type: "string",
              enum: ["VALID", "EXPIRED", "OWNER_MISMATCH", "NOT_MEMBERSHIP"],
            },
          },
        },
      },
    },
    paths: {
      "/api/config": {
        get: get("Network identity.", {
          security: false,
          response: { status: "200", schema: ref("NetworkConfig") },
        }),
      },
      "/api/auth/challenge": {
        post: post("Ask for a single-use challenge to sign.", {
          security: false,
          body: {
            type: "object",
            required: ["address"],
            properties: { address: { type: "string" } },
          },
          response: {
            status: "201",
            schema: {
              type: "object",
              properties: {
                challengeId: { type: "string" },
                message: { type: "string" },
                expiresAt: { type: "string" },
              },
            },
          },
        }),
      },
      "/api/auth/session": {
        get: get("Current identity.", {
          security: optionalAuth,
          response: { status: "200", schema: ref("CurrentSession") },
        }),
        post: post("Exchange a signed challenge for a session token.", {
          security: false,
          body: {
            type: "object",
            required: ["challengeId", "address", "publicKey", "signature"],
            properties: {
              challengeId: { type: "string" },
              address: { type: "string" },
              publicKey: { type: "string" },
              signature: { type: "string" },
            },
          },
          response: {
            status: "201",
            schema: {
              type: "object",
              properties: {
                token: { type: "string" },
                address: { type: "string" },
                expiresAt: { type: "string" },
              },
            },
          },
        }),
      },
      "/api/auth/logout": {
        post: post("Revoke the session token.", {
          security: optionalAuth,
          response: {
            status: "204",
            schema: { type: "object" },
          },
        }),
      },
      "/api/profile": {
        get: get("Own profile.", { response: { status: "200", schema: ref("Profile") } }),
        put: {
          summary: "Update own profile.",
          parameters: [idempotencyHeader],
          requestBody: {
            required: true,
            content: json({
              type: "object",
              properties: {
                displayName: { type: "string" },
                bio: {
                  type: "string",
                  description: "The creator's bio, up to 120 characters.",
                },
                isPublic: { type: "boolean" },
              },
            }),
          },
          responses: {
            200: { description: "Success.", content: json(ref("Profile")) },
            ...errorResponses,
          },
        },
      },
      "/api/profile/avatar": {
        post: {
          summary: "Set own avatar (multipart: avatar).",
          description:
            "Uploads a single image (JPEG, PNG or WebP, up to 5 MB). It replaces any previous avatar.",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["avatar"],
                  properties: {
                    avatar: {
                      type: "string",
                      format: "binary",
                      description: "The avatar image.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Success.", content: json(ref("Profile")) },
            ...errorResponses,
          },
        },
        delete: {
          summary: "Remove own avatar.",
          responses: {
            200: { description: "Success.", content: json(ref("Profile")) },
            ...errorResponses,
          },
        },
      },
      "/api/creators/{address}/avatar": {
        get: get("A creator's avatar image, if any.", {
          security: false,
          parameters: [pathParam("address", "Creator wallet address.")],
          response: { status: "200", schema: { type: "string", format: "binary" } },
          binary: true,
        }),
      },
      "/api/creators/public": {
        get: get("Public creators.", {
          security: false,
          response: {
            status: "200",
            schema: { type: "array", items: ref("CreatorSearchResult") },
          },
        }),
      },
      "/api/creators/search": {
        get: get("Search creators by name.", {
          security: false,
          parameters: [queryParam("q", "Search text.", true)],
          response: {
            status: "200",
            schema: { type: "array", items: ref("CreatorSearchResult") },
          },
        }),
      },
      "/api/creators/{address}": {
        get: get("Creator, posts, membership and unlocks.", {
          security: optionalAuth,
          parameters: [pathParam("address", "Creator wallet address.")],
          response: { status: "200", schema: ref("Creator") },
        }),
      },
      "/api/posts/{id}": {
        get: get("Post metadata.", {
          security: optionalAuth,
          parameters: [pathParam("id", "Post id.")],
          response: { status: "200", schema: ref("Post") },
        }),
        delete: {
          summary: "Delete own post.",
          parameters: [pathParam("id", "Post id."), idempotencyHeader],
          responses: {
            204: { description: "Deleted." },
            ...errorResponses,
          },
        },
      },
      "/api/posts/{id}/media": {
        get: get("Full media (paid); returns the post's content type and supports Range.", {
          parameters: [pathParam("id", "Post id.")],
          response: { status: "200", schema: { type: "string", format: "binary" } },
          binary: true,
        }),
      },
      "/api/posts/publish": {
        post: {
          summary: "Publish a post (multipart: caption, price, media).",
          description:
            "Publishing is free. `price` is what a buyer pays to unlock the post, in KAS with up to 8 decimals; `0` publishes it free for everyone.",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["caption", "price", "media"],
                  properties: {
                    caption: { type: "string" },
                    price: {
                      type: "string",
                      description:
                        "What a buyer pays to unlock the post, in KAS with up to 8 decimals; `0` means free.",
                    },
                    media: {
                      type: "string",
                      format: "binary",
                      description: `The media file: one of ${MEDIA_TYPES.join(", ")}. Images up to 25 MB, videos up to 100 MB, audio and documents up to 25 MB.`,
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: "Published.",
              content: json({
                type: "object",
                properties: { id: { type: "string" } },
              }),
            },
            ...errorResponses,
            // A rejected upload names why. The codes come from the media
            // adapter, so this list cannot drift from what it returns.
            422: {
              description: `Rejected media. The code is one of ${MEDIA_ERROR_CATEGORIES.join(", ")}.`,
              content: json(ref("Error")),
            },
          },
        },
      },
      "/api/posts/{id}/payments/prepare": {
        post: post("Prepare a post purchase, optionally crediting a referrer.", {
          parameters: [pathParam("id", "Post id.")],
          body: {
            type: "object",
            properties: {
              referrer: {
                type: "string",
                description:
                  "Wallet to credit with the referral share of the platform fee (half of it), paid in the same transaction. Optional, and ignored when it is not a valid address on the server's network. The creator's payout is never reduced.",
              },
            },
          },
          bodyRequired: false,
          response: { status: "201", schema: ref("PreparedPayment") },
        }),
      },
      "/api/payments/{id}/finalize": {
        post: finalizeSubmission(
          "Submit the signed payment.",
          "Prepared payment id.",
        ),
      },
      "/api/membership/{creator}/prepare": {
        post: post("Prepare a subscription.", {
          parameters: [pathParam("creator", "Creator wallet address.")],
          response: { status: "201", schema: ref("PreparedMembership") },
        }),
      },
      "/api/membership/offers/prepare": {
        post: post("Prepare a creator offer.", {
          body: {
            type: "object",
            required: ["price"],
            properties: { price: { type: "string" } },
          },
          response: { status: "201", schema: ref("PreparedMembership") },
        }),
      },
      "/api/membership/price/prepare": {
        post: post("Prepare a subscription price change.", {
          body: {
            type: "object",
            required: ["price"],
            properties: { price: { type: "string" } },
          },
          response: { status: "201", schema: ref("PreparedMembership") },
        }),
      },
      "/api/membership/cancel/prepare": {
        post: post("Prepare a subscription cancellation.", {
          response: { status: "201", schema: ref("PreparedMembership") },
        }),
      },
      "/api/membership/offers/{id}/finalize": {
        post: finalizeSubmission(
          "Submit the signed offer.",
          "Prepared offer id.",
        ),
      },
      "/api/membership/purchases/{id}/finalize": {
        post: finalizeSubmission(
          "Submit the signed subscription.",
          "Prepared purchase id.",
        ),
      },
      "/api/membership/price/{id}/finalize": {
        post: finalizeSubmission(
          "Submit the signed price change.",
          "Prepared price update id.",
        ),
      },
      "/api/membership/cancel/{id}/finalize": {
        post: finalizeSubmission(
          "Submit the signed cancellation.",
          "Prepared cancellation id.",
        ),
      },
      "/api/verify/membership/address/{address}": {
        get: get("Membership status from chain, by address.", {
          security: false,
          parameters: [
            pathParam("address", "Member wallet address."),
            queryParam("owner", "Expected owner address."),
          ],
          response: {
            status: "200",
            schema: {
              type: "object",
              properties: {
                address: { type: "string" },
                verifiedAt: { type: "string" },
                valid: { type: "boolean" },
                memberships: { type: "array", items: ref("MembershipCheck") },
              },
            },
          },
        }),
      },
      "/api/verify/membership/utxo/{transactionId}/{outputIndex}": {
        get: get("Membership status from chain, by UTXO.", {
          security: false,
          parameters: [
            pathParam("transactionId", "Mint transaction id."),
            pathParam("outputIndex", "Covenant output index."),
            queryParam("owner", "Expected owner address."),
          ],
          response: { status: "200", schema: ref("MembershipCheck") },
        }),
      },
      "/api/feedback": {
        post: post("Send short feedback.", {
          security: false,
          body: {
            type: "object",
            required: ["message"],
            properties: { message: { type: "string", maxLength: 1500 } },
          },
          response: { status: "202", schema: { type: "object" } },
        }),
      },
    },
  };
}

/** A minimal page that renders the contract from `/api/openapi.json`. */
export function apiDocsHtml(origin: string): string {
  const canonical = new URL(API_DOCS_PATH, origin).toString();
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Kaskama API</title>",
    '<meta name="description" content="The Kaskama HTTP API: the same contract the browser app uses, open to any wallet client.">',
    `<link rel="canonical" href="${canonical}">`,
    '<meta property="og:title" content="Kaskama API">',
    `<meta property="og:url" content="${canonical}">`,
    "</head><body>",
    `<noscript><p>This page needs JavaScript to render. The same contract is available as data at <a href="${OPENAPI_PATH}">${OPENAPI_PATH}</a> and as a guide at <a href="${AGENT_GUIDE_PATH}">${AGENT_GUIDE_PATH}</a>.</p></noscript>`,
    `<redoc spec-url="${OPENAPI_PATH}"></redoc>`,
    '<script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>',
    "</body></html>",
  ].join("\n");
}
