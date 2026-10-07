import { useState } from "react";
import { Link } from "react-router-dom";
import type { CreatorSearchResult } from "@kaskama/shared";
import { api, ApiError } from "./kasware.js";
import { Spinner } from "./Spinner.js";
import { useToast } from "./Toast.js";
import { useAsyncResource } from "./useAsyncResource.js";
import { creatorPath } from "./creator-url.js";
import { compactAddress, relativeTimeAgo } from "./format.js";

/** The mark a card shows, quietly, when a creator has not set a picture. */
const DEFAULT_AVATAR = "/kaskama-logo.svg";

export function PublicCreatorsPage() {
  const {
    data,
    loading,
    error: loadError,
  } = useAsyncResource(
    (signal) => api<CreatorSearchResult[]>("/api/creators/public", { signal }),
    [],
  );
  const creators = data ?? [];
  const error =
    loadError instanceof ApiError
      ? loadError.message
      : loadError
        ? "Creators could not be loaded."
        : null;

  return (
    <section className="find-page creators-page">
      <header>
        <h1>Creators.</h1>
        <p className="lede">
          Subscribe for 30 days, or unlock one post at a time. Your KAS goes
          straight to them.
        </p>
      </header>
      {error && (
        <p className="feedback inline error" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p className="feedback inline">
          <Spinner /> Loading...
        </p>
      )}
      {!loading && !error && creators.length === 0 && (
        <p className="feedback inline">No creators yet.</p>
      )}
      <div className="creator-grid">
        {creators.map((creator) => (
          <CreatorCard key={creator.address} creator={creator} />
        ))}
      </div>
    </section>
  );
}

/**
 * A directory entry: a face, a name, a copyable address handle, the creator's
 * bio, and — as a sign they are still around — when they last posted. The whole
 * card opens the creator's page; the only exception is the address, which
 * copies. A missing picture falls back to a quiet Kaskama mark, never a
 * stand-in face.
 */
function CreatorCard({ creator }: { creator: CreatorSearchResult }) {
  const [imageFailed, setImageFailed] = useState(false);
  const { showToast } = useToast();
  const name = creator.displayName ?? compactAddress(creator.address);
  const address = compactAddress(creator.address);
  const avatarSrc =
    !imageFailed && creator.avatarUrl ? creator.avatarUrl : DEFAULT_AVATAR;
  const isDefaultAvatar = avatarSrc === DEFAULT_AVATAR;

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(creator.address);
      showToast("Address copied.", "success");
    } catch {
      showToast("Couldn't copy the address.", "error");
    }
  }

  return (
    <article className="creator-card">
      <Link
        className="creator-card-open"
        to={creatorPath(creator.address)}
        aria-label={`Open ${name}'s page`}
      />
      <div className="creator-card-head">
        <span
          className={isDefaultAvatar ? "creator-avatar is-default" : "creator-avatar"}
          aria-hidden="true"
        >
          <img src={avatarSrc} alt="" onError={() => setImageFailed(true)} />
        </span>
        <div className="creator-card-ident">
          {creator.displayName ? (
            <>
              <h2 className="creator-card-name">{creator.displayName}</h2>
              <button
                type="button"
                className="creator-card-handle"
                title={creator.address}
                aria-label={`Copy ${creator.displayName}'s wallet address`}
                onClick={() => void copyAddress()}
              >
                {address}
              </button>
            </>
          ) : (
            <h2 className="creator-card-name is-address">
              <button
                type="button"
                className="creator-card-copy"
                title={creator.address}
                aria-label={`Copy wallet address ${address}`}
                onClick={() => void copyAddress()}
              >
                {address}
              </button>
            </h2>
          )}
        </div>
      </div>
      {creator.bio && <p className="creator-card-line">{creator.bio}</p>}
      {creator.lastPostedAt && (
        <p className="creator-card-posted">
          {postedLabel(relativeTimeAgo(creator.lastPostedAt))}
        </p>
      )}
    </article>
  );
}

/** "Posted 2d ago" — or "Posted just now", which already reads as a phrase. */
function postedLabel(relative: string): string {
  return relative ? `Posted ${relative}` : "";
}
