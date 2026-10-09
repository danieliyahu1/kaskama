import { RETRY_AFTER_REFRESH } from "@kaskama/shared";
import { COPY } from "./copy.js";
import {
  errorText,
  isInsufficientFunds,
  isNetworkRequired,
  isWalletMissing,
} from "./errors.js";
import { ApiError } from "./api-error.js";
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

/**
 * The one reaction to a failed wallet action: refresh when the server says the
 * resource moved, and present the outcome. Shared by the membership actions and
 * the one-off post purchase, so the policy lives once.
 */
export async function actionFailure(
  error: unknown,
  fallback: string,
  report: {
    reload?: () => Promise<void> | void;
    show: (message: string, tone: ToastTone, action?: ToastAction) => void;
  },
): Promise<void> {
  if (isNetworkRequired(error)) return;
  const refresh =
    error instanceof ApiError && error.retry === RETRY_AFTER_REFRESH;
  if (refresh && report.reload) await report.reload();
  const presented = presentError(error, fallback);
  report.show(
    presented.message,
    refresh ? "info" : presented.tone,
    presented.action,
  );
}
