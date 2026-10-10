// GENERATED FILE - do not edit by hand.
// Source of truth: backend/contracts/membership.sil
// Regenerate with: pnpm generate:covenant

/** The floor a creator may price a membership at, in sompi. */
export const MIN_MEMBERSHIP_PRICE_SOMPI = 200_000_000n;

/** The ceiling a creator may price a membership at, in sompi. */
export const MAX_MEMBERSHIP_PRICE_SOMPI = 100_000_000_000_000n;

/** The platform fee floor: one percent of the price, never less, in sompi. */
export const MIN_MEMBERSHIP_FEE_SOMPI = 100_000_000n;

/** How long a membership lasts, in DAA score. */
export const MEMBERSHIP_DURATION_DAA = 25_920_000n;

/** The owner-index output value a mint requires, in sompi. */
export const MEMBERSHIP_INDEX_VALUE = 50_000_000n;

/** The minter and member covenant output value, in sompi. */
export const MEMBERSHIP_OUTPUT_VALUE = 50_000_000n;
