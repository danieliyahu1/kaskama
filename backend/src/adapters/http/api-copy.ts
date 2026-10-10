import {
  MAX_MEMBERSHIP_PRICE_SOMPI,
  MIN_MEMBERSHIP_PRICE_SOMPI,
  type MembershipPriceProblem,
} from "@kaskama/shared";

/** Whole KAS, grouped, for the price-range copy. Derived, never retyped. */
function kas(sompi: bigint): string {
  return (sompi / 100_000_000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export const API_COPY = {
  authPrompt:
    "Connect to Kaskama. This only identifies your wallet. No KAS will be sent.",
  verificationFailed: "Kaskama could not verify this wallet. Try again.",
  membershipPriceEmpty: "Enter a monthly subscription price.",
  membershipPriceFormat: "Enter the price in digits only, with up to 8 decimal places.",
  membershipPriceBelowMin: `The monthly subscription price must be at least ${kas(MIN_MEMBERSHIP_PRICE_SOMPI)} KAS.`,
  membershipPriceAboveMax: `The monthly subscription price can be at most ${kas(MAX_MEMBERSHIP_PRICE_SOMPI)} KAS.`,
  membershipStale:
    "This subscription changed while you were confirming it. Nothing was charged - submit again.",
  membershipSubmissionFailed: "Something went wrong. You weren't charged. Try again.",
  membershipOfferExists: "This subscription is already live.",
  membershipCancellationStale: "This subscription already changed. Submit again.",
  membershipPurchaseExists: "You already have this subscription.",
  insufficientFunds: "You need enough KAS for the post and the network fee.",
  purchasePending: "Purchase pending. Do not pay again.",
  transactionRejected: "Transaction rejected. Nothing was charged. Try again.",
  unlocked: "Unlocked.",
  mediaAlreadyPublished: "You've already published this.",
} as const;

export function membershipPriceMessage(problem: MembershipPriceProblem): string {
  switch (problem) {
    case "EMPTY":
      return API_COPY.membershipPriceEmpty;
    case "FORMAT":
      return API_COPY.membershipPriceFormat;
    case "BELOW_MIN":
      return API_COPY.membershipPriceBelowMin;
    case "ABOVE_MAX":
      return API_COPY.membershipPriceAboveMax;
  }
}
