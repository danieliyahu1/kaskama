export const PLATFORM_FEE_BPS = 100n;
export const BPS_DENOMINATOR = 10_000n;
export const MIN_PLATFORM_FEE_SOMPI = 100_000_000n;

/**
 * The referrer's share of the platform fee, in basis points: half of it. The
 * platform keeps the other half, so a referred sale never pays out more than
 * the fee it collected.
 */
export const REFERRAL_SHARE_BPS = 5_000n;

/**
 * Every payout output the server builds must be at least this large. A UTXO
 * worth less costs more to spend than it is worth, so a smaller share is not
 * created at all: the value stays with the platform instead of becoming dust.
 */
export const MIN_OUTPUT_SOMPI = 100_000_000n;

export function platformFeeSompi(amountSompi: bigint): bigint {
  if (amountSompi < 0n) throw new Error("INVALID_PAYMENT_AMOUNT");
  const fee = (amountSompi * PLATFORM_FEE_BPS + BPS_DENOMINATOR / 2n) / BPS_DENOMINATOR;
  return fee >= MIN_PLATFORM_FEE_SOMPI ? fee : 0n;
}

/** How one purchase's price is divided between the creator, a referrer, and the platform. */
export interface PaymentSplit {
  /** The creator's payout: the price minus the fee. Never reduced by a referral. */
  creator: bigint;
  /** The referrer's payout, or 0 when no referral is paid. */
  referrer: bigint;
  /** What the platform keeps: the fee, or what is left after the referral. */
  platform: bigint;
}

/**
 * Splits a purchase price. The creator always receives the price minus the
 * platform fee. On a referred purchase the referrer receives
 * `REFERRAL_SHARE_BPS` of the fee and the platform keeps the rest - but only
 * when both shares clear `MIN_OUTPUT_SOMPI`. Otherwise no referrer output is
 * built and the platform keeps the whole fee, so the transaction never carries
 * a sub-minimum payout.
 */
export function paymentSplit(amountSompi: bigint, referred: boolean): PaymentSplit {
  const fee = platformFeeSompi(amountSompi);
  const share = referred ? (fee * REFERRAL_SHARE_BPS) / BPS_DENOMINATOR : 0n;
  const paid = share >= MIN_OUTPUT_SOMPI && fee - share >= MIN_OUTPUT_SOMPI;
  const referrer = paid ? share : 0n;
  return { creator: amountSompi - fee, referrer, platform: fee - referrer };
}
