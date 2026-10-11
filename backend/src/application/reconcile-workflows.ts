import type {
  MembershipGateway,
  MembershipVerifier,
  PaymentGateway,
  Repositories,
} from "./ports.js";
import { MembershipSettlement } from "./membership-settlement.js";
import { currentMembershipContract } from "../membership-contract.js";
import type {
  MembershipAttemptStatus,
  PaymentAttemptStatus,
  MembershipAttempt,
  PaymentAttempt,
} from "../domain/models.js";
import { logger as defaultLogger, safeError, type Logger } from "../observability.js";
import { defaultMetrics, type Metrics } from "../metrics.js";

/**
 * How long a persisted transaction may stay unresolved before the reconciler
 * stops waiting for it. A transaction that never lands on chain is not a
 * payment; leaving it pending forever would hide that from the operator.
 */
const STALE_WORKFLOW_MS = 15 * 60 * 1_000;
const DEFAULT_BATCH = 100;

export interface WorkflowReconcilerDependencies {
  store: Repositories;
  paymentGateway?: PaymentGateway | undefined;
  membershipGateway?: MembershipGateway | undefined;
  membershipVerifier?: MembershipVerifier | undefined;
  now?: (() => number) | undefined;
  logger?: Logger | undefined;
  metrics?: Metrics | undefined;
  batchSize?: number | undefined;
  staleWorkflowMs?: number | undefined;
}

export interface ReconcileSummary {
  scanned: number;
  confirmed: number;
  rejected: number;
  retried: number;
  abandoned: number;
}

/**
 * Drives every in-flight payment and membership transaction to a terminal
 * off-chain state without any further client involvement.
 *
 * A user can approve a transaction in their wallet and then lose connectivity,
 * close the tab, or simply never return. The chain may still accept the
 * transaction and, for memberships, discovery can later find it. The receipt,
 * however, must be written by the server from chain evidence. This service is
 * the durable half of "the backend decides": it polls persisted transaction IDs
 * and finalizes the off-chain record. It never broadcasts a transaction and
 * never trusts a value the client supplied. Exactly one process finalizes a
 * workflow because terminal claiming is atomic in the store.
 */
export class WorkflowReconciler {
  private readonly now: () => number;
  private readonly logger: Logger;
  private readonly metrics: Metrics;
  private readonly batchSize: number;
  private readonly staleWorkflowMs: number;
  private readonly settlement: MembershipSettlement;

  constructor(private readonly d: WorkflowReconcilerDependencies) {
    this.now = d.now ?? Date.now;
    this.logger = d.logger ?? defaultLogger;
    this.metrics = d.metrics ?? defaultMetrics;
    this.batchSize = d.batchSize ?? DEFAULT_BATCH;
    this.staleWorkflowMs = d.staleWorkflowMs ?? STALE_WORKFLOW_MS;
    this.settlement = new MembershipSettlement(
      d.membershipGateway,
      d.membershipVerifier,
    );
  }

  /** One reconciliation pass over all unresolved workflows. */
  async run(now = this.now()): Promise<ReconcileSummary> {
    const summary: ReconcileSummary = {
      scanned: 0,
      confirmed: 0,
      rejected: 0,
      retried: 0,
      abandoned: 0,
    };
    await this.reconcilePayments(now, summary);
    await this.reconcileMemberships(now, summary);
    this.metrics.workflowReconcileRun(summary);
    if (summary.confirmed || summary.rejected || summary.abandoned)
      this.logger.info("workflow_reconcile_cycle", { ...summary });
    return summary;
  }

  private async reconcilePayments(
    now: number,
    summary: ReconcileSummary,
  ): Promise<void> {
    const gateway = this.d.paymentGateway;
    if (!gateway) return;
    for (const workflow of await this.d.store.pendingPaymentAttempts(this.batchSize)) {
      summary.scanned += 1;
      await this.reconcilePayment(gateway, workflow, now, summary).catch((error) =>
        this.logFailure("payment", error),
      );
    }
  }

  private async reconcilePayment(
    gateway: PaymentGateway,
    workflow: PaymentAttemptStatus,
    now: number,
    summary: ReconcileSummary,
  ): Promise<void> {
    // The prepared record is the server's own view of what the buyer authorized.
    // It is read without an expiry window because reconciliation happens after
    // the client's prepared TTL has elapsed.
    const prepared = await this.d.store.getPaymentAttemptForSettlement(
      workflow.preparedPaymentId,
    );
    if (!prepared) {
      await this.abandonPayment(workflow, now, "attempt_missing", summary);
      return;
    }
    const submission = await gateway.status(workflow.transactionId);
    if (submission.isAccepted === null) {
      if (this.workflowAge(workflow, now) > this.staleWorkflowMs)
        await this.abandonPayment(workflow, now, "unconfirmed_timeout", summary);
      else summary.retried += 1;
      return;
    }
    if (submission.isAccepted !== true) {
      await this.rejectPayment(workflow, now, summary);
      return;
    }
    await this.confirmPayment(workflow, prepared, workflow.transactionId, now, summary);
  }

  private async confirmPayment(
    workflow: PaymentAttemptStatus,
    prepared: PaymentAttempt,
    transactionId: string,
    now: number,
    summary: ReconcileSummary,
  ): Promise<void> {
    const claimed = await this.d.store.claimPaymentAttemptTerminal(
      workflow.preparedPaymentId,
      "CONFIRMED",
      now,
    );
    if (claimed === null) return;
    const outcome = await this.d.store.finalizePurchase(workflow.preparedPaymentId, {
      postId: prepared.postId,
      buyer: prepared.buyer,
      transactionId,
    });
    await this.d.store.deletePaymentAttempt(workflow.preparedPaymentId);
    summary.confirmed += 1;
    this.metrics.paymentFinalizeAttempt(
      outcome === "DUPLICATE" ? "purchase_exists" : "confirmed",
    );
  }

  private async rejectPayment(
    workflow: PaymentAttemptStatus,
    now: number,
    summary: ReconcileSummary,
  ): Promise<void> {
    const claimed = await this.d.store.claimPaymentAttemptTerminal(
      workflow.preparedPaymentId,
      "REJECTED",
      now,
      "RECONCILED_REJECTED",
    );
    if (claimed === null) return;
    await this.d.store.deletePaymentAttempt(workflow.preparedPaymentId);
    summary.rejected += 1;
    this.metrics.paymentFinalizeAttempt("rejected");
  }

  private async abandonPayment(
    workflow: PaymentAttemptStatus,
    now: number,
    reason: string,
    summary: ReconcileSummary,
  ): Promise<void> {
    const claimed = await this.d.store.claimPaymentAttemptTerminal(
      workflow.preparedPaymentId,
      "REJECTED",
      now,
      reason,
    );
    if (claimed === null) return;
    await this.d.store.deletePaymentAttempt(workflow.preparedPaymentId);
    summary.abandoned += 1;
    this.metrics.paymentFinalizeAttempt("abandoned");
    this.logger.warn("workflow_reconcile_payment_abandoned", { reason });
  }

  private async reconcileMemberships(
    now: number,
    summary: ReconcileSummary,
  ): Promise<void> {
    if (!this.d.membershipVerifier && !this.d.membershipGateway) return;
    for (const workflow of await this.d.store.pendingMembershipAttempts(
      this.batchSize,
    )) {
      summary.scanned += 1;
      await this.reconcileMembership(workflow, now, summary).catch((error) =>
        this.logFailure("membership", error),
      );
    }
  }

  private async reconcileMembership(
    workflow: MembershipAttemptStatus,
    now: number,
    summary: ReconcileSummary,
  ): Promise<void> {
    const prepared = await this.d.store.getMembershipAttemptForSettlement(
      workflow.preparedMembershipId,
    );
    if (!prepared) {
      await this.abandonMembership(workflow, now, "attempt_missing", summary);
      return;
    }
    const settlement = await this.settlement.settle(prepared, workflow.transactionId);
    if (settlement.state === "PENDING") {
      if (this.workflowAge(workflow, now) > this.staleWorkflowMs)
        await this.abandonMembership(workflow, now, "unconfirmed_timeout", summary);
      else summary.retried += 1;
      return;
    }
    if (settlement.state === "REJECTED") {
      await this.rejectMembership(workflow, now, summary);
      return;
    }
    await this.confirmMembership(workflow, prepared, now, summary);
  }

  private async confirmMembership(
    workflow: MembershipAttemptStatus,
    prepared: MembershipAttempt,
    now: number,
    summary: ReconcileSummary,
  ): Promise<void> {
    const claimed = await this.d.store.claimMembershipAttemptTerminal(
      workflow.preparedMembershipId,
      "CONFIRMED",
      now,
    );
    if (claimed === null) return;
    await this.finalizeMembershipRecord(prepared, workflow.transactionId);
    await this.d.store.deleteMembershipAttempt(workflow.preparedMembershipId);
    summary.confirmed += 1;
    this.metrics.membershipFinalizeAttempt(prepared.kind, "confirmed");
  }

  private async finalizeMembershipRecord(
    prepared: MembershipAttempt,
    transactionId: string,
  ): Promise<void> {
    switch (prepared.kind) {
      case "offer":
        await this.d.store.finalizeOffer(prepared.id, {
          creator: prepared.creator,
          covenantId: prepared.covenantId,
          priceSompi: prepared.priceSompi ?? "0",
          contract: prepared.contract ?? currentMembershipContract(),
        });
        return;
      case "update":
        await this.d.store.finalizePriceUpdate(prepared.id, {
          creator: prepared.creator,
          covenantId: prepared.covenantId,
          priceSompi: prepared.priceSompi ?? "0",
        });
        return;
      case "cancel":
        if (this.d.store.finalizeCancellation)
          await this.d.store.finalizeCancellation(prepared.id, {
            creator: prepared.creator,
            covenantId: prepared.covenantId,
          });
        return;
      case "purchase":
        await this.d.store.finalizeMembershipPurchase(prepared.id, {
          transactionId,
          buyer: prepared.buyer,
          creator: prepared.creator,
          covenantId: prepared.covenantId,
        });
        return;
    }
  }

  private async rejectMembership(
    workflow: MembershipAttemptStatus,
    now: number,
    summary: ReconcileSummary,
  ): Promise<void> {
    const claimed = await this.d.store.claimMembershipAttemptTerminal(
      workflow.preparedMembershipId,
      "REJECTED",
      now,
      "RECONCILED_REJECTED",
    );
    if (claimed === null) return;
    await this.d.store.deleteMembershipAttempt(workflow.preparedMembershipId);
    summary.rejected += 1;
  }

  private async abandonMembership(
    workflow: MembershipAttemptStatus,
    now: number,
    reason: string,
    summary: ReconcileSummary,
  ): Promise<void> {
    const claimed = await this.d.store.claimMembershipAttemptTerminal(
      workflow.preparedMembershipId,
      "REJECTED",
      now,
      reason,
    );
    if (claimed === null) return;
    await this.d.store.deleteMembershipAttempt(workflow.preparedMembershipId);
    summary.abandoned += 1;
    this.logger.warn("workflow_reconcile_membership_abandoned", { reason });
  }

  private workflowAge(
    workflow: { submittedAt?: number | null | undefined },
    now: number,
  ): number {
    return now - (workflow.submittedAt ?? now);
  }

  private logFailure(kind: string, error: unknown): void {
    this.logger.warn("workflow_reconcile_failed", {
      kind,
      error: safeError(error),
    });
  }
}
