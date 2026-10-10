import { LibsqlStore } from "./libsql-store.js";
import { MemoryStore } from "./memory-store.js";
import type { MembershipAttempt, PaymentAttempt } from "./domain/models.js";
import type { Repositories } from "./application/ports.js";

const now = 1_000_000;

function payment(id: string, expiresAt: number): PaymentAttempt {
  return {
    id,
    transaction: `{"id":"${id}"}`,
    fingerprint: `fp-${id}`,
    amountSompi: "100000000",
    creator: "kaspatest:creator",
    postId: `post-${id}`,
    buyer: "kaspatest:buyer",
    expiresAt,
  };
}

function membership(id: string, expiresAt: number): MembershipAttempt {
  return {
    id,
    transaction: `{"id":"${id}"}`,
    fingerprint: `fp-${id}`,
    covenantId: "a".repeat(64),
    signInputs: [0, 2],
    memberOutputIndex: 1,
    creator: "kaspatest:creator",
    buyer: "kaspatest:buyer",
    kind: "purchase",
    expiresAt,
    priceSompi: "1000000000",
  };
}

describe.each([
  ["memory", () => new MemoryStore()],
  ["libsql", () => new LibsqlStore("file::memory:")],
])("payment attempts: %s", (_name, createStore) => {
  it("round-trips and prunes payment attempts", async () => {
    const store: Repositories = createStore();
    await store.initialize();
    const live = payment("pay-live", now + 60_000);
    const expired = payment("pay-expired", now - 1);
    await store.savePaymentAttempt(live);
    await store.savePaymentAttempt(expired);

    expect(await store.getPaymentAttempt(live.id, now)).toEqual(live);
    expect(await store.getPaymentAttempt(expired.id, now)).toBeNull();

    await store.prunePaymentAttempts(now);

    expect(await store.getPaymentAttempt(live.id, now)).toEqual(live);
    expect(await store.getPaymentAttempt(expired.id, now - 2)).toBeNull();
    await store.deletePaymentAttempt(live.id);
    expect(await store.getPaymentAttempt(live.id, now)).toBeNull();
  });

  it("round-trips and prunes membership attempts", async () => {
    const store: Repositories = createStore();
    await store.initialize();
    const live = membership("mem-live", now + 60_000);
    const expired = membership("mem-expired", now - 1);
    const noIndex = {
      ...membership("mem-null", now + 60_000),
      memberOutputIndex: null,
    };
    await store.saveMembershipAttempt(live);
    await store.saveMembershipAttempt(expired);
    await store.saveMembershipAttempt(noIndex);

    expect(await store.getMembershipAttempt(live.id, now)).toEqual(live);
    expect(await store.getMembershipAttempt(noIndex.id, now)).toEqual(noIndex);
    expect(await store.getMembershipAttempt(expired.id, now)).toBeNull();

    await store.pruneMembershipAttempts(now);

    expect(await store.getMembershipAttempt(live.id, now)).toEqual(live);
    expect(await store.getMembershipAttempt(expired.id, now - 2)).toBeNull();
    await store.deleteMembershipAttempt(live.id);
    expect(await store.getMembershipAttempt(live.id, now)).toBeNull();
  });
});
