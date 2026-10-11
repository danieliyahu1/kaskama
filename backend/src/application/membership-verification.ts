import type { MembershipPurchaseRepository, MembershipVerifier } from "./ports.js";
import type { MembershipCheck } from "../domain/models.js";

/**
 * Answers "which memberships does this address hold?".
 *
 * Kaspa identifies a covenant by its covenant_id, but the public node offers no
 * reverse index from an address to a covenant_id, so discovery starts from the
 * receipt recorded at mint time (the covenant handle) and the chain only proves
 * the covenant output is still unspent. That proof does not rest on any wallet
 * coin, so an ordinary spend can no longer hide a live membership.
 */
export class MembershipVerification {
  constructor(
    private readonly receipts: MembershipPurchaseRepository,
    private readonly verifier?: MembershipVerifier,
  ) {}

  async checksFor(address: string, owner?: string): Promise<MembershipCheck[]> {
    const verifier = this.verifier;
    if (!verifier) return [];
    const expectedOwner = owner ?? address;
    const receipts = await this.receipts.membershipReceiptsForBuyer(address);
    return Promise.all(
      receipts.map((receipt) =>
        verifier.verifyUtxo(
          receipt.transactionId,
          1,
          expectedOwner,
          receipt.covenantId,
          receipt.creator,
        ),
      ),
    );
  }
}
