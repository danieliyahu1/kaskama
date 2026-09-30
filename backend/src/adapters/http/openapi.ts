import { AGENT_GUIDE_PATH } from "@kaskama/shared";

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
    503: { description: "Upstream unavailable.", content: json(ref("Error")) },
  };

  const post = (
    summary: string,
    options: {
      security?: boolean;
      body?: Record<string, unknown>;
      response?: { status: string; schema: Record<string, unknown> | { $ref: string } };
      parameters?: Record<string, unknown>[];
    },
  ) => ({
    summary,
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...(options.security === false ? { security: [] } : {}),
    ...(options.body
      ? { requestBody: { required: true, content: json(options.body) } }
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
      security?: boolean;
      response: { status: string; schema: Record<string, unknown> | { $ref: string } };
      parameters?: Record<string, unknown>[];
      binary?: boolean;
    },
  ) => ({
    summary,
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...(options.security === false ? { security: [] } : {}),
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
          },
        },
        Post: {
          type: "object",
          properties: {
            id: { type: "string" },
            creator: { type: "string" },
            caption: { type: "string" },
            priceSompi: { type: "string" },
            mediaType: { type: "string" },
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
        PreparedTransaction: {
          type: "object",
          properties: {
            id: { type: "string" },
            transaction: {
              type: "string",
              description: "An unsigned transaction JSON the client signs.",
            },
            amountSompi: { type: "string" },
            signInputs: { type: "array", items: { type: "integer" } },
          },
        },
        SubmissionResult: {
          type: "object",
          properties: {
            state: { type: "string", enum: ["CONFIRMED", "PENDING", "REJECTED"] },
            transactionId: { type: ["string", "null"] },
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
          requestBody: {
            required: true,
            content: json({
              type: "object",
              properties: {
                displayName: { type: "string" },
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
          parameters: [pathParam("address", "Creator wallet address.")],
          response: { status: "200", schema: ref("Creator") },
        }),
      },
      "/api/posts/{id}": {
        get: get("Post metadata.", {
          parameters: [pathParam("id", "Post id.")],
          response: { status: "200", schema: ref("Post") },
        }),
        delete: {
          summary: "Delete own post.",
          parameters: [pathParam("id", "Post id.")],
          responses: {
            204: { description: "Deleted." },
            ...errorResponses,
          },
        },
      },
      "/api/posts/{id}/preview": {
        get: get("Blurred preview image.", {
          security: false,
          parameters: [pathParam("id", "Post id.")],
          response: { status: "200", schema: { type: "string", format: "binary" } },
        }),
      },
      "/api/posts/{id}/media": {
        get: get("Full media (paid); supports Range.", {
          parameters: [pathParam("id", "Post id.")],
          response: { status: "200", schema: { type: "string", format: "binary" } },
          binary: true,
        }),
      },
      "/api/posts/publish": {
        post: {
          summary: "Publish a post (multipart: caption, price, media).",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["caption", "price", "media"],
                  properties: {
                    caption: { type: "string" },
                    price: { type: "string" },
                    media: { type: "string", format: "binary" },
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
          },
        },
      },
      "/api/posts/{id}/payments/prepare": {
        post: post("Prepare a post purchase.", {
          parameters: [pathParam("id", "Post id.")],
          response: { status: "201", schema: ref("PreparedTransaction") },
        }),
      },
      "/api/payments/{id}/finalize": {
        post: post("Submit the signed payment.", {
          parameters: [pathParam("id", "Prepared payment id.")],
          body: tokenBody,
          response: { status: "201", schema: ref("SubmissionResult") },
        }),
      },
      "/api/membership/{creator}/prepare": {
        post: post("Prepare a subscription.", {
          parameters: [pathParam("creator", "Creator wallet address.")],
          response: { status: "201", schema: ref("PreparedTransaction") },
        }),
      },
      "/api/membership/offers/prepare": {
        post: post("Prepare a creator offer.", {
          body: {
            type: "object",
            required: ["price"],
            properties: { price: { type: "string" } },
          },
          response: { status: "201", schema: ref("PreparedTransaction") },
        }),
      },
      "/api/membership/price/prepare": {
        post: post("Prepare a subscription price change.", {
          body: {
            type: "object",
            required: ["price"],
            properties: { price: { type: "string" } },
          },
          response: { status: "201", schema: ref("PreparedTransaction") },
        }),
      },
      "/api/membership/cancel/prepare": {
        post: post("Prepare a subscription cancellation.", {
          response: { status: "201", schema: ref("PreparedTransaction") },
        }),
      },
      "/api/membership/offers/{id}/finalize": {
        post: post("Submit the signed offer.", {
          parameters: [pathParam("id", "Prepared offer id.")],
          body: tokenBody,
          response: { status: "201", schema: ref("SubmissionResult") },
        }),
      },
      "/api/membership/purchases/{id}/finalize": {
        post: post("Submit the signed subscription.", {
          parameters: [pathParam("id", "Prepared purchase id.")],
          body: tokenBody,
          response: { status: "201", schema: ref("SubmissionResult") },
        }),
      },
      "/api/membership/price/{id}/finalize": {
        post: post("Submit the signed price change.", {
          parameters: [pathParam("id", "Prepared price update id.")],
          body: tokenBody,
          response: { status: "201", schema: ref("SubmissionResult") },
        }),
      },
      "/api/membership/cancel/{id}/finalize": {
        post: post("Submit the signed cancellation.", {
          parameters: [pathParam("id", "Prepared cancellation id.")],
          body: tokenBody,
          response: { status: "201", schema: ref("SubmissionResult") },
        }),
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
  const canonical = new URL("/docs/api", origin).toString();
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
    '<redoc spec-url="/api/openapi.json"></redoc>',
    '<script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>',
    "</body></html>",
  ].join("\n");
}
