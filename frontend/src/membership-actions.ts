import { useState } from "react";
import { signPreparedPayment } from "./kasware.js";
import {
  finalizeCancellation,
  finalizePriceUpdate,
  finalizeSubscription,
  prepareCancellation,
  preparePriceUpdate,
  prepareSubscription,
} from "./purchase.js";
import { useToast } from "./Toast.js";
import { actionFailure } from "./error-toast.js";

export type SubscriptionStage = "preparing" | "confirming" | null;

/** The copy for one membership action: confirmed, pending, and failed. */
export interface MembershipActionMessages {
  confirmed: string;
  pending: string;
  failed: string;
}

export interface CancellationMessages extends MembershipActionMessages {
  /** The text of the confirmation prompt shown before closing the offer. */
  confirm: string;
}

export interface MembershipActionsOptions {
  /** The seller whose subscription is acted on. */
  creator: string;
  /** The signed-in wallet, or null. */
  address: string | null;
  /** Signs in with the wallet; resolves to the address or null. */
  signIn: () => Promise<string | null>;
  /** Reloads the seller once a change lands. */
  reload: () => Promise<void> | void;
}

type PreparedAction = { id: string; transaction: string; signInputs: number[] };
type ActionResult = { state: string };

/**
 * The one implementation of the membership actions — subscribe, start the
 * offer, change the price, and close it — shared by the creator profile and the
 * checkout page. The flow (sign in, prepare → sign → finalize, error policy)
 * lives here once, so the two pages cannot drift apart.
 */
export function useMembershipActions({
  creator,
  address,
  signIn,
  reload,
}: MembershipActionsOptions) {
  const [stage, setStage] = useState<SubscriptionStage>(null);
  const { showToast, dismissToast } = useToast();

  async function signInIfNeeded(): Promise<string | null> {
    return address ?? (await signIn());
  }

  /** Signs in and returns the wallet only when it is the creator's own. */
  async function ownerWallet(): Promise<string | null> {
    const wallet = await signInIfNeeded();
    return wallet === creator ? wallet : null;
  }

  async function run(
    prepare: () => Promise<PreparedAction>,
    finalize: (id: string, signedTransaction: string) => Promise<ActionResult>,
    messages: MembershipActionMessages,
  ): Promise<void> {
    dismissToast();
    setStage("preparing");
    try {
      const prepared = await prepare();
      const signedTransaction = await signPreparedPayment(
        prepared.transaction,
        prepared.signInputs,
      );
      setStage("confirming");
      const result = await finalize(prepared.id, signedTransaction);
      const confirmed = result.state === "CONFIRMED";
      showToast(
        confirmed ? messages.confirmed : messages.pending,
        confirmed ? "success" : "info",
      );
      if (confirmed) await reload();
    } catch (error) {
      await actionFailure(error, messages.failed, { reload, show: showToast });
    } finally {
      setStage(null);
    }
  }

  /** A buyer subscribes to the creator's offer. */
  async function subscribe(messages: MembershipActionMessages): Promise<void> {
    if (!(await signInIfNeeded())) return;
    await run(
      () => prepareSubscription(false, creator),
      (id, signedTransaction) =>
        finalizeSubscription(false, id, signedTransaction),
      messages,
    );
  }

  /** The creator starts their offer at `price`. */
  async function startOffer(
    price: string,
    messages: MembershipActionMessages,
  ): Promise<void> {
    if (!(await ownerWallet())) return;
    await run(
      () => prepareSubscription(true, creator, price),
      (id, signedTransaction) =>
        finalizeSubscription(true, id, signedTransaction),
      messages,
    );
  }

  /**
   * The creator profile's single action: the signed-in wallet decides whether
   * this starts the offer (owner) or buys it (buyer).
   */
  async function subscribeOrStart(
    price: string,
    buyerMessages: MembershipActionMessages,
    ownerMessages: MembershipActionMessages,
  ): Promise<void> {
    const wallet = await signInIfNeeded();
    if (!wallet) return;
    const actingAsOwner = wallet === creator;
    await run(
      () =>
        prepareSubscription(
          actingAsOwner,
          creator,
          actingAsOwner ? price : undefined,
        ),
      (id, signedTransaction) =>
        finalizeSubscription(actingAsOwner, id, signedTransaction),
      actingAsOwner ? ownerMessages : buyerMessages,
    );
  }

  /** The creator changes the offer price. */
  async function updatePrice(
    price: string,
    messages: MembershipActionMessages,
  ): Promise<void> {
    if (!(await ownerWallet())) return;
    await run(
      () => preparePriceUpdate(price),
      (id, signedTransaction) => finalizePriceUpdate(id, signedTransaction),
      messages,
    );
  }

  /** The creator closes the offer permanently. */
  async function cancel(messages: CancellationMessages): Promise<void> {
    if (!(await ownerWallet())) return;
    if (!window.confirm(messages.confirm)) return;
    await run(
      () => prepareCancellation(),
      (id, signedTransaction) => finalizeCancellation(id, signedTransaction),
      messages,
    );
  }

  return {
    stage,
    busy: stage !== null,
    subscribe,
    startOffer,
    subscribeOrStart,
    updatePrice,
    cancel,
  };
}
