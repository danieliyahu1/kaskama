import { MIN_OUTPUT_SOMPI, paymentSplit, platformFeeSompi } from "./payment-fee.js";

describe("platform fee", () => {
  it("charges the one percent fee only once it reaches one KAS", () => {
    expect(platformFeeSompi(10_000_000_000n)).toBe(100_000_000n);
    expect(platformFeeSompi(20_000_000_000n)).toBe(200_000_000n);
    expect(platformFeeSompi(9_999_999_950n)).toBe(100_000_000n);
    expect(platformFeeSompi(9_999_999_949n)).toBe(0n);
    expect(platformFeeSompi(100_000_000n)).toBe(0n);
    expect(platformFeeSompi(1_000_000n)).toBe(0n);
    expect(platformFeeSompi(49n)).toBe(0n);
  });
});

describe("payment split", () => {
  it("sends the whole price to the creator and keeps the whole fee without a referrer", () => {
    expect(paymentSplit(50_000_000_000n, false)).toEqual({
      creator: 49_500_000_000n,
      referrer: 0n,
      platform: 500_000_000n,
    });
  });

  it("gives the referrer half the fee once both halves clear the minimum", () => {
    expect(paymentSplit(50_000_000_000n, true)).toEqual({
      creator: 49_500_000_000n,
      referrer: 250_000_000n,
      platform: 250_000_000n,
    });
  });

  it("never reduces the creator's payout, and conserves the fee, for a referral", () => {
    const plain = paymentSplit(123_456_789_000n, false);
    const referred = paymentSplit(123_456_789_000n, true);
    expect(referred.creator).toBe(plain.creator);
    expect(referred.referrer + referred.platform).toBe(plain.platform);
  });

  it("skips the referral when half the fee is below the one-KAS minimum", () => {
    // A one-KAS fee cannot be split into two one-KAS payouts.
    expect(paymentSplit(9_999_999_950n, true)).toEqual({
      creator: 9_899_999_950n,
      referrer: 0n,
      platform: 100_000_000n,
    });
  });

  it("pays no referrer when the fee itself is waived", () => {
    expect(paymentSplit(1_000_000n, true)).toEqual({
      creator: 1_000_000n,
      referrer: 0n,
      platform: 0n,
    });
  });

  it("rounds the referral down, leaving the extra sompi with the platform", () => {
    expect(paymentSplit(30_000_000_001n, true)).toEqual({
      creator: 29_700_000_001n,
      referrer: 150_000_000n,
      platform: 150_000_000n,
    });
  });

  it("never builds a payout below the minimum output", () => {
    for (const amount of [
      1n,
      99_999_999n,
      100_000_000n,
      9_999_999_950n,
      20_000_000_000n,
      30_000_000_001n,
      1_000_000_000_000n,
    ]) {
      const split = paymentSplit(amount, true);
      for (const payout of [split.referrer, split.platform]) {
        expect(payout === 0n || payout >= MIN_OUTPUT_SOMPI).toBe(true);
      }
      expect(split.referrer + split.platform).toBe(platformFeeSompi(amount));
    }
  });
});
