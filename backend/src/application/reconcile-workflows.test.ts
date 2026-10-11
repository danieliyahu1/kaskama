import { MemoryStore } from "../memory-store.js";
import { WorkflowReconciler } from "./reconcile-workflows.js";
import type {
  MembershipGateway,
  MembershipVerifier,
  PaymentGateway,
  PaymentSubmission,
} from "./ports.js";
import type { MembershipCheck, Post } from "../domain/models.js";

const now = 1_000_000;
const buyer = "kaspatest:buyer";
const creator = "kaspatest:creator";

const post = (id: string, priceSompi = "1000"): Post => ({
  id,
  creator,
  caption: "A post",
  priceSompi,
  mediaType: "image/jpeg",
  mediaSize: 10,
  mediaDigest: "d".repeat(64),
  mediaKey: "media/key",
  publishedAt: now,
});

const accepted = (transactionId: string): PaymentSubmission => ({
  isAccepted: true,
  transactionId,
  rejection: null,
});

const pending = (transactionId: string): PaymentSubmission => ({
  isAccepted: null,
  transactionId,
  rejection: null,
});

const rejected = (transactionId: string): PaymentSubmission => ({
  isAccepted: false,
  transactionId,
  rejection: "REJECTED",
});

function paymentGateway(
  status: (transactionId: string) => PaymentSubmission | Promise<PaymentSubmission>,
): PaymentGateway {
  return {
    prepare: async () => {
      throw new Error("not used");
    },
    submit: async () => {
      throw new Error("not used");
    },
    status: async (transactionId) => status(transactionId),
    verifyPurchase: async () => true,
  };
}

function validCheck(transactionId: string): MembershipCheck {
  return {
    transactionId,
    outputIndex: 1,
    covenantId: "a".repeat(64),
    kind: "token",
    tokenType: "membership",
    owner: buyer,
    contentCreator: creator,
    platformAddress: "kaspatest:platform",
    createdAtDaa: "1",
    expiresAtDaa: "9999999",
    createdAt: null,
    validUntil: null,
    status: "VALID",
  };
}

const membershipVerifier = (check: MembershipCheck): MembershipVerifier => ({
  verifyUtxo: async () => check,
});

const membershipGateway: MembershipGateway = {
  prepareOffer: async () => {
    throw new Error("not used");
  },
  prepareMint: async () => {
    throw new Error("not used");
  },
  preparePriceUpdate: async () => {
    throw new Error("not used");
  },
  prepareCancellation: async () => {
    throw new Error("not used");
  },
  submit: async () => {
    throw new Error("not used");
  },
  confirm: async () => {
    throw new Error("not used");
  },
  status: async () => pending("unused"),
};

describe("WorkflowReconciler", () => {
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore();
    await store.initialize();
  });

  async function savePayment(options: {
    transactionId: string;
    expiresAt?: number;
    submittedAt?: number;
  }) {
    await store.savePaymentAttempt({
      id: "prepared-1",
      transaction: "{}",
      fingerprint: "fp",
      amountSompi: "1000",
      creator,
      postId: "paid-post",
      buyer,
      expiresAt: options.expiresAt ?? now + 60_000,
    });
    await store.markPaymentSubmitted({
      preparedPaymentId: "prepared-1",
      state: "SUBMITTED",
      transactionId: options.transactionId,
      rejection: null,
      submittedAt: options.submittedAt ?? now,
    });
  }

  it("finalizes a purchase when the chain later accepts the transaction", async () => {
    await store.publishPost(post("paid-post"));
    await savePayment({ transactionId: "tx-1" });

    const reconciler = new WorkflowReconciler({
      store,
      paymentGateway: paymentGateway(() => accepted("tx-1")),
    });
    const summary = await reconciler.run(now);

    expect(summary.confirmed).toBe(1);
    expect(await store.getPurchase("paid-post", buyer)).toMatchObject({
      transactionId: "tx-1",
    });
    expect(await store.getPaymentSubmission("prepared-1")).toBeNull();
  });

  it("leaves a still-pending payment in flight and retries later", async () => {
    await store.publishPost(post("paid-post"));
    await savePayment({ transactionId: "tx-1", submittedAt: now });

    const reconciler = new WorkflowReconciler({
      store,
      paymentGateway: paymentGateway(() => pending("tx-1")),
    });
    const summary = await reconciler.run(now);

    expect(summary.retried).toBe(1);
    expect(summary.confirmed).toBe(0);
    expect(await store.getPaymentSubmission("prepared-1")).toMatchObject({
      state: "SUBMITTED",
    });
  });

  it("abandons a payment that never reaches the chain after the stale window", async () => {
    await store.publishPost(post("paid-post"));
    await savePayment({
      transactionId: "tx-1",
      submittedAt: now - 16 * 60 * 1_000,
    });

    const reconciler = new WorkflowReconciler({
      store,
      paymentGateway: paymentGateway(() => pending("tx-1")),
    });
    const summary = await reconciler.run(now);

    expect(summary.abandoned).toBe(1);
    expect(await store.getPaymentSubmission("prepared-1")).toBeNull();
    expect(await store.getPurchase("paid-post", buyer)).toBeNull();
  });

  it("records a rejection without creating a purchase", async () => {
    await store.publishPost(post("paid-post"));
    await savePayment({ transactionId: "tx-1" });

    const reconciler = new WorkflowReconciler({
      store,
      paymentGateway: paymentGateway(() => rejected("tx-1")),
    });
    const summary = await reconciler.run(now);

    expect(summary.rejected).toBe(1);
    expect(await store.getPurchase("paid-post", buyer)).toBeNull();
    expect(await store.getPaymentSubmission("prepared-1")).toBeNull();
  });

  it("still settles a payment whose prepared record outlived the client TTL", async () => {
    await store.publishPost(post("paid-post"));
    // The client's window to finalize has closed, but the transaction we
    // broadcast is still in flight. The reconciler must not treat the attempt
    // as missing just because the template expired.
    await savePayment({
      transactionId: "tx-1",
      expiresAt: now - 1,
      submittedAt: now,
    });

    const reconciler = new WorkflowReconciler({
      store,
      paymentGateway: paymentGateway(() => accepted("tx-1")),
    });
    const summary = await reconciler.run(now);

    expect(summary.confirmed).toBe(1);
    expect(summary.abandoned).toBe(0);
    expect(await store.getPurchase("paid-post", buyer)).toMatchObject({
      transactionId: "tx-1",
    });
  });

  it("finalizes a membership purchase receipt from accepted chain state", async () => {
    await store.saveMembershipAttempt({
      id: "prepared-1",
      transaction: "{}",
      fingerprint: "fp",
      covenantId: "a".repeat(64),
      signInputs: [1],
      memberOutputIndex: 1,
      creator,
      buyer,
      kind: "purchase",
      expiresAt: now + 60_000,
      priceSompi: "1000",
    });
    await store.markMembershipSubmitted({
      preparedMembershipId: "prepared-1",
      state: "SUBMITTED",
      transactionId: "tx-1",
      rejection: null,
      submittedAt: now,
    });

    const reconciler = new WorkflowReconciler({
      store,
      membershipGateway,
      membershipVerifier: membershipVerifier(validCheck("tx-1")),
    });
    const summary = await reconciler.run(now);

    expect(summary.confirmed).toBe(1);
    expect(await store.membershipReceipts(buyer, creator)).toHaveLength(1);
    expect(await store.getMembershipSubmission("prepared-1")).toBeNull();
  });

  it("keeps the contract a reconciled offer was created with", async () => {
    // An offer the client left for the reconciler must keep the contract it was
    // created with, or a later contract change orphans its on-chain identity.
    const contract = { prefix: "6b", suffix: "6a" };
    await store.saveMembershipAttempt({
      id: "prepared-1",
      transaction: "{}",
      fingerprint: "fp",
      covenantId: "a".repeat(64),
      signInputs: [0],
      memberOutputIndex: null,
      creator,
      buyer: creator,
      kind: "offer",
      expiresAt: now + 60_000,
      priceSompi: "1000",
      contract,
    });
    await store.markMembershipSubmitted({
      preparedMembershipId: "prepared-1",
      state: "SUBMITTED",
      transactionId: "tx-1",
      rejection: null,
      submittedAt: now,
    });

    const reconciler = new WorkflowReconciler({
      store,
      membershipGateway: {
        ...membershipGateway,
        status: async () => accepted("tx-1"),
      },
    });
    const summary = await reconciler.run(now);

    expect(summary.confirmed).toBe(1);
    expect((await store.getCreatorCovenant(creator))?.contract).toEqual(contract);
  });

  it("still settles a membership whose prepared record outlived the client TTL", async () => {
    await store.saveMembershipAttempt({
      id: "prepared-1",
      transaction: "{}",
      fingerprint: "fp",
      covenantId: "a".repeat(64),
      signInputs: [1],
      memberOutputIndex: 1,
      creator,
      buyer,
      kind: "purchase",
      expiresAt: now - 1,
      priceSompi: "1000",
    });
    await store.markMembershipSubmitted({
      preparedMembershipId: "prepared-1",
      state: "SUBMITTED",
      transactionId: "tx-1",
      rejection: null,
      submittedAt: now,
    });

    const reconciler = new WorkflowReconciler({
      store,
      membershipGateway,
      membershipVerifier: membershipVerifier(validCheck("tx-1")),
    });
    const summary = await reconciler.run(now);

    expect(summary.confirmed).toBe(1);
    expect(summary.abandoned).toBe(0);
    expect(await store.membershipReceipts(buyer, creator)).toHaveLength(1);
  });

  it("only one concurrent reconciler finalizes a workflow", async () => {
    await store.publishPost(post("paid-post"));
    await savePayment({ transactionId: "tx-1" });

    const gateway = paymentGateway(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return accepted("tx-1");
    });
    const reconciler = new WorkflowReconciler({ store, paymentGateway: gateway });
    const [first, second] = await Promise.all([
      reconciler.run(now),
      reconciler.run(now),
    ]);

    expect(first.confirmed + second.confirmed).toBe(1);
    expect(await store.getPurchase("paid-post", buyer)).toMatchObject({
      transactionId: "tx-1",
    });
  });
});
