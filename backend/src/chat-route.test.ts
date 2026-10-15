import request from "supertest";
import { createApp } from "./app.js";
import { MemoryStore } from "./memory-store.js";
import type { MembershipVerifier, ObjectStorage } from "./application/ports.js";
import type { MembershipCheck } from "./domain/models.js";

const creator = `kaspatest:${"c".repeat(60)}`;
const fan = `kaspatest:${"f".repeat(60)}`;

const storage: ObjectStorage = {
  putFile: async () => undefined,
  readRange: async () => ({
    bytes: new Uint8Array(),
    size: 0,
    contentType: "image/jpeg",
  }),
  delete: async () => undefined,
};

/** A verifier that accepts any receipt, so `isActive` can be granted. */
const acceptingVerifier: MembershipVerifier = {
  verifyUtxo: async (transactionId, outputIndex, owner, covenantId, of) =>
    ({
      transactionId,
      outputIndex,
      covenantId: covenantId ?? null,
      kind: "token",
      tokenType: "membership",
      owner: owner ?? null,
      contentCreator: of ?? null,
      platformAddress: "kaspatest:platform",
      createdAtDaa: "1",
      expiresAtDaa: "2",
      createdAt: null,
      validUntil: null,
      status: "VALID",
    }) satisfies MembershipCheck,
};

async function signIn(store: MemoryStore, address: string): Promise<string> {
  await store.createSession({
    id: `session-${address}`,
    address,
    expiresAt: Date.now() + 60_000,
  });
  return `kaskama_session=session-${address}`;
}

/** A subscriber: a recorded receipt the verifier accepts. */
async function subscribe(store: MemoryStore, buyer: string) {
  await store.createMembershipPurchase({
    transactionId: "tx-membership",
    buyer,
    creator,
    covenantId: "covenant-1",
  });
}

function appWith(store: MemoryStore, withVerifier = true) {
  return createApp({
    store,
    storage,
    walletVerifier: { verify: async () => false },
    ...(withVerifier ? { membershipVerifier: acceptingVerifier } : {}),
    publicOrigin: "http://localhost:5173",
    now: () => Date.now(),
  });
}

describe("chat routes", () => {
  it("requires a session", async () => {
    const store = new MemoryStore();
    const app = appWith(store);

    await request(app).get("/api/chat/threads").expect(401);
    await request(app).get(`/api/chat/threads/${creator}`).expect(401);
    await request(app)
      .post(`/api/chat/threads/${creator}/messages`)
      .send({ body: "hi" })
      .expect(401);
  });

  it("shows a non-subscriber no conversation and refuses their message", async () => {
    const store = new MemoryStore();
    const cookie = await signIn(store, fan);
    const app = appWith(store);

    const conversation = await request(app)
      .get(`/api/chat/threads/${creator}`)
      .set("Cookie", cookie)
      .expect(200);
    expect(conversation.body).toMatchObject({ canSend: false, messages: [] });

    const send = await request(app)
      .post(`/api/chat/threads/${creator}/messages`)
      .set("Cookie", cookie)
      .send({ body: "hello" })
      .expect(403);
    expect(send.body.error).toBe("SUBSCRIPTION_REQUIRED");
  });

  it("carries a subscriber's message to the creator's inbox", async () => {
    const store = new MemoryStore();
    await subscribe(store, fan);
    const fanCookie = await signIn(store, fan);
    const creatorCookie = await signIn(store, creator);
    const app = appWith(store);

    const sent = await request(app)
      .post(`/api/chat/threads/${creator}/messages`)
      .set("Cookie", fanCookie)
      .send({ body: "hello there" })
      .expect(201);
    expect(sent.body).toMatchObject({ body: "hello there", mine: true });

    const inbox = await request(app)
      .get("/api/chat/threads")
      .set("Cookie", creatorCookie)
      .expect(200);
    expect(inbox.body.threads).toEqual([
      expect.objectContaining({
        address: fan,
        lastMessage: "hello there",
        unread: 1,
        counterpartIsCreator: false,
      }),
    ]);
  });

  it("marks a conversation read and lets the creator reply", async () => {
    const store = new MemoryStore();
    await subscribe(store, fan);
    const fanCookie = await signIn(store, fan);
    const creatorCookie = await signIn(store, creator);
    const app = appWith(store);

    await request(app)
      .post(`/api/chat/threads/${creator}/messages`)
      .set("Cookie", fanCookie)
      .send({ body: "hello" })
      .expect(201);

    const read = await request(app)
      .get(`/api/chat/threads/${fan}`)
      .set("Cookie", creatorCookie)
      .expect(200);
    expect(read.body).toMatchObject({ canSend: true });
    expect(read.body.messages).toHaveLength(1);

    await request(app)
      .post(`/api/chat/threads/${fan}/messages`)
      .set("Cookie", creatorCookie)
      .send({ body: "welcome" })
      .expect(201);

    const inbox = await request(app)
      .get("/api/chat/threads")
      .set("Cookie", creatorCookie)
      .expect(200);
    expect(inbox.body.threads[0]).toMatchObject({ unread: 0, lastMessage: "welcome" });
  });

  it("rejects an empty message", async () => {
    const store = new MemoryStore();
    await subscribe(store, fan);
    const cookie = await signIn(store, fan);
    const app = appWith(store);

    const response = await request(app)
      .post(`/api/chat/threads/${creator}/messages`)
      .set("Cookie", cookie)
      .send({ body: "   " })
      .expect(400);
    expect(response.body.error).toBe("INVALID_MESSAGE");
  });

  it("rejects a malformed address and a conversation with oneself", async () => {
    const store = new MemoryStore();
    const cookie = await signIn(store, fan);
    const app = appWith(store);

    await request(app)
      .get("/api/chat/threads/not-an-address")
      .set("Cookie", cookie)
      .expect(400);
    await request(app)
      .get(`/api/chat/threads/${fan}`)
      .set("Cookie", cookie)
      .expect(400);
  });
});
