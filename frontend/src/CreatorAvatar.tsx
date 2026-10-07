import { useState } from "react";

/** The mark shown, quietly, when a creator has not set a picture. */
const DEFAULT_AVATAR = "/kaskama-logo.svg";

/**
 * A creator's face, or the quiet Kaskama mark when they have not set one. A
 * picture that fails to load falls back to the mark too: never a stand-in face.
 * The rule lives here once, so every surface that shows a creator agrees.
 */
export function CreatorAvatar({ avatarUrl }: { avatarUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  const src = !failed && avatarUrl ? avatarUrl : DEFAULT_AVATAR;
  const isDefault = src === DEFAULT_AVATAR;

  return (
    <span
      className={isDefault ? "creator-avatar is-default" : "creator-avatar"}
      aria-hidden="true"
    >
      <img src={src} alt="" onError={() => setFailed(true)} />
    </span>
  );
}
