import { Link } from "react-router-dom";
import { Icon } from "./Icons.js";
import { Spinner } from "./Spinner.js";
import { shortenAddress } from "./format.js";
import { creatorPath } from "./creator-url.js";

type AccountMenuProps = {
  address: string;
  displayName: string | null;
  avatarUrl: string | null;
  name: string;
  bio: string;
  loading: boolean;
  error: string | null;
  saving: boolean;
  avatarBusy: boolean;
  onNameChange: (value: string) => void;
  onBioChange: (value: string) => void;
  onSave: () => void;
  onAvatarFile: (file: File) => void;
  onAvatarRemove: () => void;
  onSignOut: () => void;
};

export function AccountMenu({
  address,
  displayName,
  avatarUrl,
  name,
  bio,
  loading,
  error,
  saving,
  avatarBusy,
  onNameChange,
  onBioChange,
  onSave,
  onAvatarFile,
  onAvatarRemove,
  onSignOut,
}: AccountMenuProps) {
  const busy = saving || loading || Boolean(error);
  return (
    <details className="account">
      <summary aria-label={summaryLabel(loading, error, displayName)}>
        {loading ? <Spinner /> : <Icon name="user" />}{" "}
        {greeting(loading, error, displayName)}
      </summary>
      <div className="account-menu">
        <div className="account-avatar">
          <span className="account-avatar-preview">
            {avatarUrl ? <img src={avatarUrl} alt="" /> : <Icon name="user" />}
          </span>
          <div className="account-avatar-actions">
            <label className="menu-button avatar-upload">
              <input
                type="file"
                accept="image/*"
                disabled={avatarBusy || busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) onAvatarFile(file);
                }}
              />
              <span className="menu-label">
                {avatarBusy ? "Uploading..." : "Change photo"}
              </span>
            </label>
            {avatarUrl && (
              <button
                className="menu-button"
                type="button"
                disabled={avatarBusy || busy}
                onClick={onAvatarRemove}
              >
                Remove photo
              </button>
            )}
          </div>
        </div>

        <label htmlFor="display-name">Display name</label>
        <NameField
          name={name}
          loading={loading}
          error={error}
          onNameChange={onNameChange}
        />

        <label htmlFor="bio">Bio</label>
        <input
          id="bio"
          value={bio}
          onChange={(event) => onBioChange(event.target.value)}
          placeholder="Ambient music for deep work"
          maxLength={120}
          disabled={loading || Boolean(error)}
        />

        <button className="menu-button" disabled={busy} onClick={onSave}>
          <span className="menu-label">
            {saving && <Spinner />}
            {saving ? "Saving..." : "Save"}
          </span>
          <Icon name="check" />
        </button>
        <p className="account-address">{shortenAddress(address)}</p>
        <Link className="menu-button" to={creatorPath(address)}>
          My page
        </Link>
        <button className="menu-button" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </details>
  );
}

function NameField({
  name,
  loading,
  error,
  onNameChange,
}: {
  name: string;
  loading: boolean;
  error: string | null;
  onNameChange: (value: string) => void;
}) {
  if (loading) return <p className="account-loading">Loading profile...</p>;
  if (error) return <p className="account-loading">{error}</p>;
  return (
    <input
      id="display-name"
      value={name}
      onChange={(event) => onNameChange(event.target.value)}
      placeholder="Add a display name"
      maxLength={40}
    />
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
