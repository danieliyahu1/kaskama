import { COPY } from "./copy.js";
import { errorText, isInsufficientFunds, isWalletMissing } from "./errors.js";
import { KASPA_GET_KAS_URL, KASWARE_DOWNLOAD_URL } from "./kasware.js";
import type { ToastAction, ToastTone } from "./Toast.js";

/**
 * How a failed wallet-touching action should be presented. Neither a missing
 * extension nor an empty wallet is a user error: each becomes an actionable
 * notice with the one link that resolves it, instead of a dead-end error toast.
 */
export function presentError(
  error: unknown,
  fallback: string,
): { message: string; tone: ToastTone; action?: ToastAction } {
  if (isWalletMissing(error)) {
    return {
      message: COPY.kaswareMissing,
      tone: "notice",
      action: { label: COPY.kaswareDownload, href: KASWARE_DOWNLOAD_URL },
    };
  }
  if (isInsufficientFunds(error)) {
    return {
      message: COPY.insufficientFunds,
      tone: "notice",
      action: { label: COPY.getKas, href: KASPA_GET_KAS_URL },
    };
  }
  return { message: errorText(error, fallback), tone: "error" };
}
