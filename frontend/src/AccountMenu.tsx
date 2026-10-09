import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CreatorAvatar } from "./CreatorAvatar.js";
import { Icon } from "./Icons.js";
import { Spinner } from "./Spinner.js";
import { shortenAddress } from "./format.js";
import { creatorPath } from "./creator-url.js";

type AccountMenuProps = {
  address: string;
  displayName: string | null;
  avatarUrl: string | null;
  loading: boolean;
  error: string | null;
  onSignOut: () => void;
};

/**
 * The account menu is a doorway, not the room. It shows who you are and gets
 * you out or onward; editing your identity happens on its own surface, where a
 * deliberate act has room to land. The door closes behind you on every action.
 */
export function AccountMenu({
  address,
  displayName,
  avatarUrl,
  loading,
  error,
  onSignOut,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: Event) => {
      if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <details
      className="account"
      ref={root}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary aria-label={summaryLabel(loading, error, displayName)}>
        {loading ? <Spinner /> : <CreatorAvatar avatarUrl={avatarUrl} />}{" "}
        {greeting(loading, error, displayName)}
      </summary>
      <div className="account-menu">
        <p className="account-address">{shortenAddress(address)}</p>
        <Link className="menu-button" to="/profile/edit" onClick={close}>
          Edit profile
          <Icon name="edit" />
        </Link>
        <Link className="menu-button" to={creatorPath(address)} onClick={close}>
          My page
        </Link>
        <button
          className="menu-button"
          onClick={() => {
            close();
            onSignOut();
          }}
        >
          Sign out
        </button>
      </div>
    </details>
  );
}

function greeting(loading: boolean, error: string | null, displayName: string | null) {
  if (loading) return "Checking profile...";
  if (error) return "Profile unavailable";
  return `Hi, ${displayName ?? "there"}!`;
}

function summaryLabel(
  loading: boolean,
  error: string | null,
  displayName: string | null,
) {
  if (loading) return "Your account, checking profile";
  if (error) return "Your account, profile unavailable";
  return `Your account ${displayName ?? "Add your name"}`;
}
