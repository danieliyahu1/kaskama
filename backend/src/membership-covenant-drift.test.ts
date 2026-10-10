import { readFileSync } from "node:fs";
import {
  MAX_MEMBERSHIP_PRICE_SOMPI,
  MEMBERSHIP_DURATION_DAA,
  MEMBERSHIP_INDEX_VALUE,
  MEMBERSHIP_OUTPUT_VALUE,
  MIN_MEMBERSHIP_FEE_SOMPI,
  MIN_MEMBERSHIP_PRICE_SOMPI,
} from "@kaskama/shared";
import { describe, expect, it } from "vitest";

/**
 * The covenant is the single source of truth for the protocol constants; the
 * app's copy in shared/src/covenant.ts is generated from it. This test binds the
 * two, so editing the covenant without running `pnpm generate:covenant` - or
 * hand-editing the generated file - fails here instead of drifting silently.
 */
const covenant = readFileSync(
  new URL("../contracts/membership.sil", import.meta.url),
  "utf8",
);

function constant(name: string): bigint {
  const match = new RegExp(`int constant ${name} = (\\d+);`).exec(covenant);
  if (!match?.[1]) throw new Error(`membership.sil has no constant ${name}`);
  return BigInt(match[1]);
}

const regenerate = "run `pnpm generate:covenant`";

describe("membership covenant constants", () => {
  it("match the generated app constants", () => {
    expect(constant("MIN_PRICE_SOMPI"), regenerate).toBe(MIN_MEMBERSHIP_PRICE_SOMPI);
    expect(constant("MAX_PRICE_SOMPI"), regenerate).toBe(MAX_MEMBERSHIP_PRICE_SOMPI);
    expect(constant("MIN_FEE_SOMPI"), regenerate).toBe(MIN_MEMBERSHIP_FEE_SOMPI);
    expect(constant("MEMBERSHIP_LIFETIME_DAA"), regenerate).toBe(
      MEMBERSHIP_DURATION_DAA,
    );
    expect(constant("INDEX_OUTPUT_VALUE"), regenerate).toBe(MEMBERSHIP_INDEX_VALUE);
    expect(constant("MEMBERSHIP_OUTPUT_VALUE"), regenerate).toBe(
      MEMBERSHIP_OUTPUT_VALUE,
    );
  });
});
