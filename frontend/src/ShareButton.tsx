import { COPY } from "./copy.js";
import { Icon } from "./Icons.js";
import { referralShareUrl } from "./referral.js";
import { useToast } from "./Toast.js";

/**
 * Copies a link to `path` that credits the signed-in wallet with the referral
 * share of any purchase it drives. The referral lives in the link and then the
 * buyer's cookie: no account, no signup, nothing stored on the server. With no
 * signed-in wallet there is nothing to credit, so the plain link is copied.
 */
export function ShareButton({
  address,
  path,
  compact = false,
}: {
  address: string | null;
  path: string;
  /** Icon-only form, for dense places like a post card. */
  compact?: boolean;
}) {
  const { showToast } = useToast();

  async function share() {
    const url = address
      ? referralShareUrl(address, path)
      : new URL(path, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      showToast(address ? COPY.shareCopied : COPY.linkCopied, "success");
    } catch {
      showToast(COPY.shareFailed, "error");
    }
  }

  return (
    <button
      className={compact ? "share-button share-button--compact" : "share-button"}
      type="button"
      title={COPY.shareTitle}
      aria-label={COPY.shareButton}
      onClick={() => void share()}
    >
      <Icon name="share" />
      {compact ? null : COPY.shareButton}
    </button>
  );
}
