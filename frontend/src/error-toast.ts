import { COPY } from "./copy.js";
import { errorText, isWalletMissing } from "./errors.js";
import { KASWARE_DOWNLOAD_URL } from "./kasware.js";
import type { ToastAction, ToastTone } from "./Toast.js";

/**
 * How a failed wallet-touching action should be presented. A missing browser
 * extension is not a user error, so it becomes an actionable notice with a
 * download link instead of an error toast.
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
  return { message: errorText(error, fallback), tone: "error" };
}
