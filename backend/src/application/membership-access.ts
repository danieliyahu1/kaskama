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
    const covenantIds = await this.creatorCovenantIds(creator);
    for (const receipt of await this.receipts.membershipReceipts(buyer, creator)) {
      const ids = receipt.covenantId ? [receipt.covenantId] : [...covenantIds];
      for (const covenantId of ids) {
        const check = await this.verifier.verifyUtxo(
          receipt.transactionId,
          1,
          buyer,
          covenantId,
          creator,
        );
        if (check.status === "VALID") return true;
      }
    }
    return false;
  }

  /**
   * The covenants a creator has opened. A receipt recorded with a covenant id is
   * checked against that one; a legacy receipt without one is checked against
   * every covenant the creator has, since the chain only shows which covenant
   * actually backs it.
   */
  private async creatorCovenantIds(creator: string): Promise<Set<string>> {
    const current = await this.covenants.getCreatorCovenant(creator);
    const known = this.covenants.listCreatorCovenants
      ? await this.covenants.listCreatorCovenants(creator)
      : current
        ? [current]
        : [];
    const ids = new Set(known.map((value) => value.covenantId));
    if (current) ids.add(current.covenantId);
    return ids;
  }
}
