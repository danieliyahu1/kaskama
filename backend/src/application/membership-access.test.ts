import { MembershipAccess } from "./membership-access.js";
import type {
  CovenantRepository,
  MembershipPurchaseRepository,
  MembershipVerifier,
} from "./ports.js";
import type { MembershipCheck, MembershipContract, MembershipPurchase } from "../domain/models.js";

const buyer = "kaspatest:buyer";
const creator = "kaspatest:creator";
const storedContract: MembershipContract = { prefix: "6b", suffix: "51" };

function check(
  transactionId: string,
  status: MembershipCheck["status"],
): MembershipCheck {
  return {
    transactionId,
    outputIndex: 1,
    covenantId: "covenant-1",
    kind: status === "NOT_MEMBERSHIP" ? "none" : "token",
    tokenType: "membership",
    owner: buyer,
    contentCreator: creator,
    platformAddress: "kaspatest:platform",
    createdAtDaa: "1",
    expiresAtDaa: "2",
    createdAt: null,
    validUntil: null,
    status,
  };
}

function harness(options: {
  receipts?: MembershipPurchase[];
  receiptStatus?: MembershipCheck["status"];
  covenantId?: string;
  verifier?: boolean;
}) {
  const receipts = options.receipts ?? [];
  const repository: MembershipPurchaseRepository = {
    createMembershipPurchase: async () => "CREATED",
    membershipReceipts: async () => receipts,
    membershipReceiptsForBuyer: async () => receipts,
    finalizeMembershipPurchase: async () => "CREATED",
  };
  const covenants: CovenantRepository = {
    getCreatorCovenant: async () =>
      options.covenantId
        ? {
            creator,
            covenantId: options.covenantId,
            priceSompi: "1000000000",
            contract: storedContract,
          }
        : null,
    getCovenant: async () => null,
    saveCreatorCovenant: async () => "CREATED",
    finalizeOffer: async () => "CREATED",
    finalizePriceUpdate: async () => "CREATED",
  };
  const verifyUtxo = vi.fn(async (transactionId: string) =>
    check(transactionId, options.receiptStatus ?? "VALID"),
  );
  const verifier: MembershipVerifier = { verifyUtxo };
  const access = new MembershipAccess(
    covenants,
    repository,
    options.verifier === false ? undefined : verifier,
  );
  return { access, verifyUtxo };
}

describe("MembershipAccess", () => {
  it("accepts a stored receipt that still verifies on chain", async () => {
    const { access, verifyUtxo } = harness({
      receipts: [{ transactionId: "tx-1", buyer, creator }],
      covenantId: "covenant-1",
    });

    await expect(access.isActive(buyer, creator)).resolves.toBe(true);
    // The verifier owns the contract; the use case states only what it knows.
    expect(verifyUtxo).toHaveBeenCalledWith(
      "tx-1",
      1,
      buyer,
      "covenant-1",
      creator,
    );
  });

  it("denies access when a receipt is expired", async () => {
    const { access } = harness({
      covenantId: "covenant-1",
      receipts: [{ transactionId: "tx-old", buyer, creator }],
      receiptStatus: "EXPIRED",
    });

    await expect(access.isActive(buyer, creator)).resolves.toBe(false);
  });

  it("denies access when no receipt was recorded", async () => {
    const { access, verifyUtxo } = harness({ covenantId: "covenant-1" });

    await expect(access.isActive(buyer, creator)).resolves.toBe(false);
    expect(verifyUtxo).not.toHaveBeenCalled();
  });

  it("denies access when no verifier is configured", async () => {
    const { access } = harness({
      receipts: [{ transactionId: "tx-1", buyer, creator }],
      verifier: false,
    });

    await expect(access.isActive(buyer, creator)).resolves.toBe(false);
  });
});
