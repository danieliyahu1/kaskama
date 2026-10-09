import { Link } from "react-router-dom";
import type { CreatorSearchResult } from "@kaskama/shared";
import { api, ApiError } from "./kasware.js";
import { CreatorAvatar } from "./CreatorAvatar.js";
import { Spinner } from "./Spinner.js";
import { useToast } from "./Toast.js";
import { useAsyncResource } from "./useAsyncResource.js";
import { creatorPath } from "./creator-url.js";
import { compactAddress, relativeTimeAgo } from "./format.js";

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
  const { showToast } = useToast();
  const address = compactAddress(creator.address);
  const name = creator.displayName ?? address;

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
        <CreatorAvatar avatarUrl={creator.avatarUrl} />
        <div className="creator-card-ident">
          <h2
            className={
              creator.displayName
                ? "creator-card-name"
                : "creator-card-name is-address"
            }
          >
            {name}
          </h2>
          <button
            type="button"
            className="creator-card-handle"
            title={creator.address}
            aria-label={
              creator.displayName
                ? `Copy ${creator.displayName}'s wallet address`
                : `Copy wallet address ${address}`
            }
            onClick={() => void copyAddress()}
          >
            {address}
          </button>
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
