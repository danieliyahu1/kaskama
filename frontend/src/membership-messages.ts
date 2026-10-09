import type {
  CancellationMessages,
  MembershipActionMessages,
} from "./membership-actions.js";

/**
 * The words for the owner's offer actions, in one place so the edit page and the
 * checkout say the same thing for the same act. Selling is one act however it is
 * reached; its confirmation must not depend on which screen triggered it.
 */
export const START_MESSAGES: MembershipActionMessages = {
  confirmed: "Subscription is ready.",
  pending: "Your payment is confirming. Don't pay again.",
  failed: "Payment failed. Nothing was charged.",
};

export const UPDATE_MESSAGES: MembershipActionMessages = {
  confirmed: "Subscription price updated.",
  pending: "Your update is confirming. Don't repeat it.",
  failed: "Price update failed. Nothing was charged.",
};

export const CANCEL_MESSAGES: CancellationMessages = {
  confirmed: "Subscription closed permanently.",
  pending: "Your cancellation is confirming. Don't repeat it.",
  failed: "Cancellation failed. Nothing was charged.",
  confirm:
    "Close this subscription permanently? Existing memberships remain valid until expiry, but this cannot be undone.",
};
