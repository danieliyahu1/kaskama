import { MembershipVerification } from "./membership-verification.js";
import type { MembershipPurchaseRepository, MembershipVerifier } from "./ports.js";
import type { MembershipCheck, MembershipPurchase } from "../domain/models.js";

const buyer = "kaspatest:buyer";
const creator = "kaspatest:creator";
const otherCreator = "kaspatest:other-creator";

function check(
  transactionId: string,
  status: MembershipCheck["status"] = "VALID",
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
  verifier?: boolean;
}) {
  const receipts = options.receipts ?? [];
  const repository: MembershipPurchaseRepository = {
    createMembershipPurchase: async () => "CREATED",
    membershipReceipts: async () => receipts,
    membershipReceiptsForBuyer: async () => receipts,
    finalizeMembershipPurchase: async () => "CREATED",
  };
  const verifyUtxo = vi.fn(async (transactionId: string) => check(transactionId));
  const verifier: MembershipVerifier = { verifyUtxo };
  const verification = new MembershipVerification(
    repository,
    options.verifier === false ? undefined : verifier,
  );
  return { verification, verifyUtxo };
}

describe("MembershipVerification", () => {
  it("verifies every recorded covenant for the address, across creators", async () => {
    const { verification, verifyUtxo } = harness({
      receipts: [
        { transactionId: "tx-1", buyer, creator, covenantId: "covenant-1" },
        { transactionId: "tx-2", buyer, creator: otherCreator, covenantId: "covenant-2" },
      ],
    });

    const checks = await verification.checksFor(buyer);

    expect(checks.map((result) => result.status)).toEqual(["VALID", "VALID"]);
    expect(verifyUtxo).toHaveBeenCalledWith(
      "tx-1",
      1,
      buyer,
      "covenant-1",
      creator,
    );
    expect(verifyUtxo).toHaveBeenCalledWith(
      "tx-2",
      1,
      buyer,
      "covenant-2",
      otherCreator,
    );
  });

  it("never scans the address for memberships it did not record", async () => {
    const { verification, verifyUtxo } = harness({});

    await expect(verification.checksFor(buyer)).resolves.toEqual([]);
    expect(verifyUtxo).not.toHaveBeenCalled();
  });

  it("uses the supplied owner as the expected owner", async () => {
    const { verification, verifyUtxo } = harness({
      receipts: [
        { transactionId: "tx-1", buyer, creator, covenantId: "covenant-1" },
      ],
    });

    await verification.checksFor(buyer, otherCreator);

    expect(verifyUtxo).toHaveBeenCalledWith(
      "tx-1",
      1,
      otherCreator,
      "covenant-1",
      creator,
    );
  });

  it("reports nothing when no verifier is configured", async () => {
    const { verification } = harness({
      receipts: [{ transactionId: "tx-1", buyer, creator }],
      verifier: false,
    });

    await expect(verification.checksFor(buyer)).resolves.toEqual([]);
  });
});
