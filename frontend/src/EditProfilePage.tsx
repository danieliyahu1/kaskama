import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import {
  MAX_BIO_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  normalizeBio,
  normalizeDisplayName,
  type ProfileResponse,
} from "@kaskama/shared";
import { api } from "./kasware.js";
import { uploadAvatar, removeAvatar } from "./upload.js";
import { CreatorAvatar } from "./CreatorAvatar.js";
import { Spinner } from "./Spinner.js";
import { Message, HomeLink } from "./Message.js";
import { useToast } from "./Toast.js";
import { errorText } from "./errors.js";
import { creatorPath } from "./creator-url.js";
import { SubscriptionSettings } from "./SubscriptionSettings.js";
import type { WalletProps } from "./wallet.js";

/**
 * A chosen-but-unsaved picture. The avatar is not committed on selection the
 * way the menu once did it: everything on this page waits for the one Save, so
 * there is a single moment of commitment instead of two.
 */
type AvatarDraft =
  | { kind: "keep" }
  | { kind: "upload"; file: File; previewUrl: string }
  | { kind: "remove" };

type EditProfilePageProps = WalletProps & {
  profile: ProfileResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onProfileChange: (profile: ProfileResponse) => void;
};

/**
 * Where a creator edits the identity that becomes their public page. Three
 * controls, one Save, one error that belongs to the field it belongs to. The
 * profile data itself is owned by the app so the header glance stays in step.
 */
export function EditProfilePage({
  address,
  signIn,
  signingIn,
  profile,
  loading,
  error,
  onRetry,
  onProfileChange,
}: EditProfilePageProps) {
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState<AvatarDraft>({ kind: "keep" });
  const [saving, setSaving] = useState(false);
  const { showToast, dismissToast } = useToast();

  // Seed once per account, so an in-progress edit is never overwritten by a
  // profile refresh that carries the same address (a save, a visibility change).
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (!profile || seeded.current === profile.address) return;
    seeded.current = profile.address;
    setName(profile.displayName ?? "");
    setBio(profile.bio ?? "");
    setAvatar({ kind: "keep" });
  }, [profile]);

  // Release the current preview when a new one replaces it or the page closes.
  const previewUrl = avatar.kind === "upload" ? avatar.previewUrl : null;
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const nameChanged = profile
    ? normalizeDisplayName(name) !== (profile.displayName ?? "")
    : false;
  const bioChanged = profile
    ? normalizeBio(bio) !== (profile.bio ?? "")
    : false;
  const dirty = nameChanged || bioChanged || avatar.kind !== "keep";

  // A quiet guard for the one exit the app cannot intercept: closing the tab.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    dismissToast();
    setAvatar({ kind: "upload", file, previewUrl: URL.createObjectURL(file) });
  }

  function removePhoto() {
    setAvatar({ kind: "remove" });
  }

  async function commitAvatar(): Promise<ProfileResponse | null> {
    if (avatar.kind === "upload") {
      const updated = await uploadAvatar(avatar.file);
      onProfileChange(updated);
      return updated;
    }
    if (avatar.kind === "remove") {
      const updated = await removeAvatar();
      onProfileChange(updated);
      return updated;
    }
    return null;
  }

  async function commitFields(): Promise<ProfileResponse | null> {
    if (!nameChanged && !bioChanged) return null;
    const updated = await api<ProfileResponse>("/api/profile", {
      method: "PUT",
      body: JSON.stringify({
        displayName: normalizeDisplayName(name),
        bio: normalizeBio(bio),
      }),
    });
    onProfileChange(updated);
    return updated;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!profile || saving || !dirty) return;
    setSaving(true);
    dismissToast();
    try {
      const avatarResult = await commitAvatar();
      const fieldsResult = await commitFields();
      const updated = fieldsResult ?? avatarResult ?? profile;
      seeded.current = updated.address;
      setName(updated.displayName ?? "");
      setBio(updated.bio ?? "");
      setAvatar({ kind: "keep" });
      showToast("Profile saved.", "success");
    } catch (caught) {
      showToast(errorText(caught, "Profile could not be saved."), "error");
    } finally {
      setSaving(false);
    }
  }

  if (!address)
    return (
      <Message title="Sign in to edit your profile.">
        <button
          className="primary"
          disabled={signingIn}
          onClick={() => void signIn()}
        >
          {signingIn && <Spinner />}
          {signingIn ? "Signing in..." : "Sign in"}
        </button>
      </Message>
    );

  if (error)
    return (
      <Message title={error}>
        <button className="secondary" type="button" onClick={onRetry}>
          Try again
        </button>
        <HomeLink />
      </Message>
    );

  if (loading || !profile)
    return (
      <Message title="Loading..." center>
        <Spinner />
      </Message>
    );

  const shownAvatar =
    avatar.kind === "upload"
      ? avatar.previewUrl
      : avatar.kind === "remove"
        ? null
        : profile.avatarUrl;
  const hasPhoto =
    avatar.kind === "upload" ||
    (avatar.kind !== "remove" && Boolean(profile.avatarUrl));
  const photoLabel = hasPhoto ? "Change photo" : "Add photo";

  return (
    <section className="edit-profile">
      <header className="edit-profile-intro">
        <h1>Edit profile.</h1>
        <Link className="secondary" to={creatorPath(profile.address)}>
          View my page
        </Link>
      </header>
      <form onSubmit={(event) => void save(event)}>
        <div className="edit-profile-photo">
          <label className="edit-profile-photo-avatar" title={photoLabel}>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={saving}
              aria-label={photoLabel}
              onChange={choosePhoto}
            />
            <CreatorAvatar avatarUrl={shownAvatar} />
          </label>
          {hasPhoto && (
            <button
              className="edit-profile-photo-remove"
              type="button"
              disabled={saving}
              aria-label="Remove photo"
              title="Remove photo"
              onClick={removePhoto}
            >
              <span className="icon-button-glyph" aria-hidden="true">
                &times;
              </span>
            </button>
          )}
        </div>
        {avatar.kind === "remove" && (
          <p className="edit-profile-note">
            Your photo is removed when you save.
          </p>
        )}

        <label htmlFor="display-name">
          Display name
          <input
            id="display-name"
            name="displayName"
            autoComplete="nickname"
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            placeholder="Add a display name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={saving}
          />
        </label>

        <label htmlFor="bio">
          Bio
          <textarea
            id="bio"
            name="bio"
            maxLength={MAX_BIO_LENGTH}
            placeholder="Ambient music for deep work"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            disabled={saving}
          />
        </label>

        <div className="edit-profile-actions">
          <button
            className="secondary edit-profile-save"
            type="submit"
            disabled={!dirty || saving}
          >
            {saving && <Spinner />}
            {saving ? "Saving..." : "Save"}
          </button>
          {dirty && !saving && (
            <p className="edit-profile-status">Unsaved changes.</p>
          )}
        </div>
      </form>
      <SubscriptionSettings
        key={address}
        address={address}
        signIn={signIn}
        signingIn={signingIn}
      />
    </section>
  );
}
