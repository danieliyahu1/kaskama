import type { MembershipGateway, MembershipVerifier } from "./ports.js";
import type { MembershipCheck, PreparedMembershipRecord } from "../domain/models.js";

export type MembershipSettlementState = "CONFIRMED" | "PENDING" | "REJECTED";

export interface MembershipSettlementResult {
  state: MembershipSettlementState;
  /** The on-chain verification, when the subject was a purchase. */
  check: MembershipCheck | null;
  /** The gateway's rejection reason, when it refused the transaction. */
  rejection: string | null;
}

/**
 * The single answer to "has this membership transaction settled, and to what
 * state?". The immediate finalize and the background reconciler both ask this,
 * so the two can never disagree about whether a purchase happened.
 *
 * A purchase is CONFIRMED only when its member output is verified on chain —
 * never on the weaker "some output of the transaction appeared" signal. While
 * the chain is still catching up the answer is PENDING, never REJECTED: a false
 * rejection of a real purchase is far worse than a purchase that settles late.
 */
export class MembershipSettlement {
  constructor(
    private readonly gateway?: MembershipGateway,
    private readonly verifier?: MembershipVerifier,
  ) {}

  async settle(
    prepared: PreparedMembershipRecord,
    transactionId: string,
  ): Promise<MembershipSettlementResult> {
    if (this.isPurchasable(prepared) && this.verifier) {
      const check = await this.verifier.verifyUtxo(
        transactionId,
        prepared.memberOutputIndex,
        prepared.buyer,
        prepared.covenantId,
        prepared.creator,
      );
      return {
        state:
          check.status === "VALID" || check.status === "EXPIRED"
            ? "CONFIRMED"
            : "PENDING",
        check,
        rejection: null,
      };
    }
    if (!this.gateway?.status)
      return { state: "PENDING", check: null, rejection: null };
    const submission = await this.gateway.status(transactionId);
    return {
      state:
        submission.isAccepted === true
          ? "CONFIRMED"
          : submission.isAccepted === false
            ? "REJECTED"
            : "PENDING",
      check: null,
      rejection: submission.rejection,
    };
  }

  private isPurchasable(
    prepared: PreparedMembershipRecord,
  ): prepared is PreparedMembershipRecord & { memberOutputIndex: number } {
    return prepared.kind === "purchase" && prepared.memberOutputIndex !== null;
  }
}
