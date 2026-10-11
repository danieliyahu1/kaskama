import type {
  CovenantRepository,
  MembershipPurchaseRepository,
  MembershipVerifier,
} from "./ports.js";

export class MembershipAccess {
  constructor(
    private readonly covenants: CovenantRepository,
    private readonly receipts: MembershipPurchaseRepository,
    private readonly verifier?: MembershipVerifier,
  ) {}

  async isActive(buyer: string, creator: string): Promise<boolean> {
    if (!this.verifier) return false;
    const current = await this.covenants.getCreatorCovenant(creator);
    const known = this.covenants.listCreatorCovenants
      ? await this.covenants.listCreatorCovenants(creator)
      : current
        ? [current]
        : [];
    const covenantIds = new Set(known.map((value) => value.covenantId));
    if (current) covenantIds.add(current.covenantId);
    const contracts = new Map(
      known.map((value) => [value.covenantId, value.contract] as const),
    );
    if (current) contracts.set(current.covenantId, current.contract);
    for (const receipt of await this.receipts.membershipReceipts(buyer, creator)) {
      const ids = receipt.covenantId ? [receipt.covenantId] : [...covenantIds];
      for (const covenantId of ids) {
        const check = await this.verifier.verifyUtxo(
          receipt.transactionId,
          1,
          buyer,
          covenantId,
          creator,
          contracts.get(covenantId),
        );
        if (check.status === "VALID") return true;
      }
    }
    return false;
  }
}
