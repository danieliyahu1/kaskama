import { ApiError } from "./api-error.js";
import { COPY } from "./copy.js";
import { presentError } from "./error-toast.js";
import {
  KASPA_GET_KAS_URL,
  KASWARE_DOWNLOAD_URL,
  WalletMissingError,
} from "./kasware.js";

describe("presentError", () => {
  it("frames a missing Kasware extension as an actionable notice, not an error", () => {
    const presented = presentError(
      new WalletMissingError(COPY.kaswareMissing),
      "fallback",
    );

    expect(presented).toEqual({
      message: COPY.kaswareMissing,
      tone: "notice",
      action: { label: COPY.kaswareDownload, href: KASWARE_DOWNLOAD_URL },
    });
  });

  it("frames an empty wallet as an actionable notice with a way to get KAS", () => {
    const presented = presentError(
      new ApiError("INSUFFICIENT_FUNDS", "Not enough KAS.", 422),
      "fallback",
    );

    expect(presented).toEqual({
      message: COPY.insufficientFunds,
      tone: "notice",
      action: { label: COPY.getKas, href: KASPA_GET_KAS_URL },
    });
  });

  it("keeps ordinary failures as errors without an action", () => {
    const presented = presentError(new Error("Payment rejected."), "fallback");

    expect(presented).toEqual({
      message: "Payment rejected.",
      tone: "error",
    });
  });

  it("falls back when the error carries no message", () => {
    const presented = presentError(new Error(""), "fallback");

    expect(presented).toEqual({ message: "fallback", tone: "error" });
  });
});
