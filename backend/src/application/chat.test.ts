import { ChatService } from "./chat.js";
import type { MembershipAccess } from "./membership-access.js";
import { MemoryStore } from "../memory-store.js";

const creator = "kaspatest:creator";
const fan = "kaspatest:fan";

/**
 * A conversation service over a real in-memory store, with a membership gate
 * that tests can turn on and off with `subscribe`/`unsubscribe`.
 */
function harness() {
  const store = new MemoryStore();
  const active = new Set<string>();
  let tick = 1_000;
  let sequence = 0;
  const service = new ChatService(
    store,
    {
      isActive: async (buyer: string, of: string) => active.has(`${buyer}|${of}`),
    } as unknown as MembershipAccess,
    () => `id-${(sequence += 1)}`,
    () => (tick += 1),
  );
  return {
    store,
    service,
    subscribe: () => active.add(`${fan}|${creator}`),
    unsubscribe: () => active.delete(`${fan}|${creator}`),
  };
}

describe("ChatService", () => {
  it("refuses a conversation with no subscription and no history", async () => {
    const { service } = harness();

    await expect(service.openConversation(fan, creator)).resolves.toMatchObject({
      kind: "READY",
      conversation: { canSend: false, messages: [] },
    });
    await expect(service.send(fan, creator, "hello")).resolves.toEqual({
      kind: "SUBSCRIBE",
    });
  });

  it("opens a thread for a subscriber and lets both sides read it", async () => {
    const { service, subscribe } = harness();
    subscribe();

    await expect(service.send(fan, creator, "hello")).resolves.toMatchObject({
      kind: "SENT",
      message: { sender: fan, body: "hello" },
    });
    await expect(service.inbox(creator)).resolves.toEqual([
      expect.objectContaining({ counterpart: fan, lastMessage: "hello", unread: 1 }),
    ]);

    await expect(service.openConversation(fan, creator)).resolves.toMatchObject({
      kind: "READY",
      conversation: {
        canSend: true,
        counterpart: creator,
        counterpartIsCreator: true,
      },
    });
    await expect(service.openConversation(creator, fan)).resolves.toMatchObject({
      kind: "READY",
      conversation: {
        canSend: true,
        counterpart: fan,
        counterpartIsCreator: false,
      },
    });
  });

  it("keeps history after a lapse but stops the write", async () => {
    const { service, subscribe, unsubscribe } = harness();
    subscribe();
    await service.send(fan, creator, "before");
    unsubscribe();

    await expect(service.openConversation(fan, creator)).resolves.toMatchObject({
      kind: "READY",
      conversation: {
        canSend: false,
        messages: [expect.objectContaining({ body: "before" })],
      },
    });
    await expect(service.send(fan, creator, "after")).resolves.toEqual({
      kind: "SUBSCRIBE",
    });
  });

  it("lets a creator reply inside an existing thread but never start one", async () => {
    const { service, subscribe } = harness();
    subscribe();

    // With no thread, the request can only be read as a fan's; a creator never
    // opens one, so nothing is written until a subscriber has.
    await expect(service.send(creator, fan, "hi")).resolves.toEqual({
      kind: "SUBSCRIBE",
    });

    await service.send(fan, creator, "hello");
    await expect(service.send(creator, fan, "welcome")).resolves.toMatchObject({
      kind: "SENT",
      message: { sender: creator },
    });
  });

  it("marks received messages read when a conversation is opened", async () => {
    const { store, service, subscribe } = harness();
    subscribe();
    await service.send(fan, creator, "hello");

    expect((await store.chatUnreadCounts(creator)).size).toBe(1);
    await service.openConversation(creator, fan);
    expect((await store.chatUnreadCounts(creator)).size).toBe(0);
  });

  it("refuses a conversation with oneself", async () => {
    const { service } = harness();
    await expect(service.openConversation(fan, fan)).resolves.toEqual({ kind: "SELF" });
  });
});
