import request from "supertest";
import { createApp } from "./app.js";
import { LibsqlStore } from "./libsql-store.js";
import { MemoryStore } from "./memory-store.js";
import type { Challenge } from "./domain/models.js";

const address =
  "kaspatest:qrzjdw58hp75mvvx6aq58kjyg3xjk7pt0k8txpll9sxdary9npn8v3pmkukdl";
const publicOrigin = "https://kaskama.test";
const now = 1_000_000;

function challenge(id: string, expiresAt: number): Challenge {
  return {
    id,
    nonce: id.padEnd(64, "0").slice(0, 64),
    address,
    origin: publicOrigin,
    network: "kaspa_testnet_10",
    message: `message-${id}`,
    expiresAt,
    consumedAt: null,
  };
}

describe("challenge pruning", () => {
  it("deletes consumed and expired challenges while keeping live ones (memory)", async () => {
    const store = new MemoryStore();
    const expired = challenge("expired", now - 1);
    const consumed = challenge("consumed", now + 60_000);
    const live = challenge("live", now + 60_000);
    await store.createChallenge(expired);
    await store.createChallenge(consumed);
    await store.createChallenge(live);
    expect(await store.consumeChallenge(consumed.id, now)).not.toBeNull();

    await store.pruneChallenges(now);

    expect(store.challenges.has(expired.id)).toBe(false);
    expect(store.challenges.has(consumed.id)).toBe(false);
    expect(store.challenges.has(live.id)).toBe(true);
  });

  it("deletes consumed and expired challenges while keeping live ones (libsql)", async () => {
    const store = new LibsqlStore("file::memory:");
    await store.initialize();
    const expired = challenge("expired", now - 1);
    const consumed = challenge("consumed", now + 60_000);
    const live = challenge("live", now + 60_000);
    await store.createChallenge(expired);
    await store.createChallenge(consumed);
    await store.createChallenge(live);
    expect(await store.consumeChallenge(consumed.id, now)).not.toBeNull();

    await store.pruneChallenges(now);

    await expect(store.createChallenge(expired)).resolves.toBeUndefined();
    await expect(store.createChallenge(consumed)).resolves.toBeUndefined();
    await expect(store.createChallenge(live)).rejects.toThrow();
  });
});

describe("challenge pruning on sign-in", () => {
  it("sweeps expired challenges when a new challenge is issued", async () => {
    const store = new MemoryStore();
    const expired = challenge("stale", now - 1);
    await store.createChallenge(expired);
    const app = createApp({
      store,
      storage: {
        putFile: async () => undefined,
        readRange: async () => ({
          bytes: new Uint8Array(),
          size: 0,
          contentType: "image/jpeg",
        }),
        delete: async () => undefined,
      },
      walletVerifier: { verify: async () => false },
      publicOrigin,
      now: () => now,
    });

    await request(app)
      .post("/api/auth/challenge")
      .set("Origin", publicOrigin)
      .send({ address })
      .expect(201);

    expect(store.challenges.has(expired.id)).toBe(false);
  });
});

describe("authentication outcomes", () => {
  function appFor(store: MemoryStore, verify: boolean) {
    return createApp({
      store,
      storage: {
        putFile: async () => undefined,
        readRange: async () => ({
          bytes: new Uint8Array(),
          size: 0,
          contentType: "image/jpeg",
        }),
        delete: async () => undefined,
      },
      walletVerifier: { verify: async () => verify },
      publicOrigin,
      now: () => now,
    });
  }

  it("returns a typed verification failure and consumes no session", async () => {
    const store = new MemoryStore();
    const app = appFor(store, false);
    const challengeResponse = await request(app)
      .post("/api/auth/challenge")
      .set("Origin", publicOrigin)
      .send({ address })
      .expect(201);

    const response = await request(app)
      .post("/api/auth/session")
      .set("Origin", publicOrigin)
      .send({
        challengeId: challengeResponse.body.challengeId,
        address,
        publicKey: "a".repeat(64),
        signature: "signature",
      })
      .expect(401);

    expect(response.body.error).toBe("WALLET_VERIFICATION_FAILED");
    expect(store.sessions.size).toBe(0);
  });

  it("rejects replaying a consumed challenge", async () => {
    const store = new MemoryStore();
    const app = appFor(store, true);
    const challengeResponse = await request(app)
      .post("/api/auth/challenge")
      .set("Origin", publicOrigin)
      .send({ address })
      .expect(201);
    const body = {
      challengeId: challengeResponse.body.challengeId,
      address,
      publicKey: "a".repeat(64),
      signature: "signature",
    };

    await request(app)
      .post("/api/auth/session")
      .set("Origin", publicOrigin)
      .send(body)
      .expect(201);
    await request(app)
      .post("/api/auth/session")
      .set("Origin", publicOrigin)
      .send(body)
      .expect(401);
    expect(store.sessions.size).toBe(1);
  });

  it("issues a bearer token that authenticates the same session as the cookie", async () => {
    const store = new MemoryStore();
    const app = appFor(store, true);
    const challengeResponse = await request(app)
      .post("/api/auth/challenge")
      .set("Origin", publicOrigin)
      .send({ address })
      .expect(201);

    const session = await request(app)
      .post("/api/auth/session")
      .set("Origin", publicOrigin)
      .send({
        challengeId: challengeResponse.body.challengeId,
        address,
        publicKey: "a".repeat(64),
        signature: "signature",
      })
      .expect(201);

    expect(session.body.token).toEqual(expect.any(String));
    expect(session.body.address).toBe(address);
    // The cookie and the bearer token carry the one session id.
    const setCookie = session.headers["set-cookie"];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    expect(cookies.join(";")).toContain(
      `kaskama_session=${session.body.token}`,
    );

    const profile = await request(app)
      .get("/api/profile")
      .set("Authorization", `Bearer ${session.body.token}`)
      .expect(200);
    expect(profile.body.address).toBe(address);
  });

  it("rejects an unknown bearer token", async () => {
    await request(appFor(new MemoryStore(), true))
      .get("/api/profile")
      .set("Authorization", "Bearer unknown-token")
      .expect(401);
  });

  it("authenticates a headless client that sends no Origin header", async () => {
    const app = appFor(new MemoryStore(), true);
    const challenge = await request(app)
      .post("/api/auth/challenge")
      .send({ address })
      .expect(201);

    const session = await request(app)
      .post("/api/auth/session")
      .send({
        challengeId: challenge.body.challengeId,
        address,
        publicKey: "a".repeat(64),
        signature: "signature",
      })
      .expect(201);

    await request(app)
      .get("/api/profile")
      .set("Authorization", `Bearer ${session.body.token}`)
      .expect(200);
  });

  it("still rejects a browser that presents a foreign Origin", async () => {
    const response = await request(appFor(new MemoryStore(), true))
      .post("/api/auth/challenge")
      .set("Origin", "https://not-kaskama.test")
      .send({ address })
      .expect(403);
    expect(response.body.error).toBe("ORIGIN_MISMATCH");
  });

  it("rejects an empty creator search at the HTTP boundary", async () => {
    await request(appFor(new MemoryStore(), true))
      .get("/api/creators/search?q=   ")
      .expect(400);
  });
});
