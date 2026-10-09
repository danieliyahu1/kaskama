import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  isFreePost,
  type CreatorResponse,
  type PostResponse,
} from "@kaskama/shared";
import { api } from "./kasware.js";
import { unlockPost } from "./purchase.js";
import { Icon, LockIcon } from "./Icons.js";
import { CreatorAvatar } from "./CreatorAvatar.js";
import { PostTile, PostTileAction, PostTileMedia } from "./PostTile.js";
import { PostMedia } from "./PostMedia.js";
import { Spinner } from "./Spinner.js";
import { useToast } from "./Toast.js";
import { HomeLink, Message } from "./Message.js";
import { COPY } from "./copy.js";
import { errorText } from "./errors.js";
import { actionFailure } from "./error-toast.js";
import { formatKas, relativeTimeAgo, shortenAddress } from "./format.js";
import { ShareButton } from "./ShareButton.js";
import type { WalletProps } from "./wallet.js";
import {
  useMembershipActions,
  type SubscriptionStage,
} from "./membership-actions.js";
import {
  checkoutPath,
  creatorAddressFromRoute,
  creatorPath,
  hasAddressPrefix,
} from "./creator-url.js";

type CreatorPageProps = WalletProps & {
  onVisibilityChange?: (isPublic: boolean) => Promise<unknown>;
};

const BUYER_MESSAGES = {
  confirmed: "Subscribed for 30 days.",
  pending: "Your payment is confirming. Don't pay again.",
  failed: "Payment failed. Nothing was charged.",
} as const;

export function CreatorPage({
  address,
  signIn,
  signingIn,
  onVisibilityChange,
}: CreatorPageProps) {
  const navigate = useNavigate();
  const { address: routeAddress = "" } = useParams();
  const creatorAddress = creatorAddressFromRoute(routeAddress);
  const [creator, setCreator] = useState<CreatorResponse | null>(null);
  const [busyPostId, setBusyPostId] = useState<string | null>(null);
  const [approvedPostId, setApprovedPostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const { showToast, dismissToast } = useToast();
  const requestId = useRef(0);

  async function loadCreator() {
    const currentRequest = ++requestId.current;
    const isNewCreator = creator?.address !== creatorAddress;
    if (isNewCreator) {
      setLoading(true);
      setCreator(null);
    }
    setLoadError(null);
    try {
      const value = await api<CreatorResponse>(
        `/api/creators/${encodeURIComponent(creatorAddress)}`,
      );
      if (currentRequest === requestId.current) {
        setCreator(value);
      }
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      const message = errorText(error, "Creator could not be loaded.");
      if (isNewCreator) setLoadError(message);
      else showToast(message, "error");
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
      }
    }
  }

  const membership = useMembershipActions({
    creator: creatorAddress,
    address,
    signIn,
    reload: loadCreator,
  });

  useEffect(() => {
    if (hasAddressPrefix(routeAddress)) {
      navigate(creatorPath(creatorAddress), { replace: true });
      return;
    }
    void loadCreator();
  }, [creatorAddress, address, navigate, routeAddress]);

  if (loading)
    return (
      <Message title="Loading..." center>
        <Spinner />
      </Message>
    );
  if (!creator)
    return (
      <Message title={loadError ?? "This creator isn't available."}>
        <HomeLink />
      </Message>
    );

  const currentCreator = creator;
  const owner = currentCreator.isOwner || address === currentCreator.address;
  // A subscription can be "offered" in the database yet not serviceable on
  // chain. The page never claims it is live unless the backend can serve it.
  const subscriptionUnavailable =
    currentCreator.membership.offered &&
    currentCreator.membership.available === false;
  const showSubscription =
    currentCreator.membership.offered ||
    currentCreator.membership.active ||
    currentCreator.membership.canceled;

  async function buyPost(target: PostResponse) {
    const buyer = address ?? (await signIn());
    if (!buyer) return;
    setBusyPostId(target.id);
    setApprovedPostId(null);
    dismissToast();
    try {
      const result = await unlockPost(target.id, () => setApprovedPostId(target.id));
      if (result.state === "CONFIRMED") {
        setCreator((previous) =>
          previous
            ? {
                ...previous,
                posts: previous.posts.map((p) =>
                  p.id === target.id ? { ...p, canView: true } : p,
                ),
              }
            : previous,
        );
        showToast(result.message ?? COPY.unlocked, "success");
      } else {
        showToast(result.message ?? COPY.purchasePending, "info");
      }
    } catch (error) {
      await actionFailure(error, "Payment failed. Nothing was charged.", {
        reload: loadCreator,
        show: showToast,
      });
    } finally {
      setBusyPostId(null);
      setApprovedPostId(null);
    }
  }

  async function deletePost(target: PostResponse) {
    if (!window.confirm("Delete this post and its media? This can't be undone."))
      return;
    setDeletingPostId(target.id);
    dismissToast();
    try {
      await api(`/api/posts/${encodeURIComponent(target.id)}`, {
        method: "DELETE",
      });
      setCreator((previous) =>
        previous
          ? { ...previous, posts: previous.posts.filter((p) => p.id !== target.id) }
          : previous,
      );
      showToast("Post deleted.", "success");
    } catch (error) {
      showToast(errorText(error, "Couldn't delete the post."), "error");
    } finally {
      setDeletingPostId(null);
    }
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(currentCreator.address);
      showToast("Address copied.", "success");
    } catch {
      showToast("Couldn't copy the address.", "error");
    }
  }

  async function toggleVisibility() {
    if (!onVisibilityChange) return;
    setVisibilityBusy(true);
    dismissToast();
    const next = !currentCreator.isPublic;
    try {
      await onVisibilityChange(next);
      setCreator({ ...currentCreator, isPublic: next });
      showToast(next ? "Profile is public." : "Profile is private.", "success");
    } catch (error) {
      showToast(errorText(error, "Couldn't save visibility."), "error");
    } finally {
      setVisibilityBusy(false);
    }
  }

  return (
    <>
      <section className="profile">
        <div className="creator-head">
          <CreatorAvatar avatarUrl={currentCreator.avatarUrl} />
          <div className="creator-identity">
            <h1 className={currentCreator.displayName ? undefined : "address-heading"}>
              {currentCreator.displayName ?? shortenAddress(currentCreator.address)}
            </h1>
            <button
              className="wallet-address"
              type="button"
              title={currentCreator.address}
              aria-label="Copy Kaspa address"
              onClick={() => void copyAddress()}
            >
              {shortenAddress(currentCreator.address)}
            </button>
            <div className="profile-visibility">
              <VisibilityBadge
                isPublic={currentCreator.isPublic}
                busy={visibilityBusy}
                {...(owner && onVisibilityChange && currentCreator.posts.length > 0
                  ? { onToggle: () => void toggleVisibility() }
                  : {})}
              />
              <ShareButton
                address={address}
                path={creatorPath(currentCreator.address)}
                compact
              />
              {owner && (
                <>
                  <Link
                    className="icon-link"
                    to="/profile/edit"
                    aria-label="Edit profile"
                    title="Edit profile"
                  >
                    <Icon name="edit" />
                  </Link>
                  <Link
                    className="secondary"
                    to={checkoutPath(currentCreator.address)}
                  >
                    {COPY.checkoutLinkLabel}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
        {currentCreator.bio && (
          <p className="creator-bio">{currentCreator.bio}</p>
        )}
        {showSubscription && (
          <div className={owner ? "access-strip is-owner" : "access-strip"}>
            <p className="access-facts">
              Subscription ·{" "}
              {subscriptionUnavailable
                ? "unavailable"
                : currentCreator.membership.priceSompi
                  ? `${formatKas(currentCreator.membership.priceSompi)} KAS · 30 days`
                  : "30 days"}
            </p>
            {!owner && (
              <div className="access-actions">
                <SubscriptionAction
                  membership={currentCreator.membership}
                  stage={membership.stage}
                  disabled={membership.busy || signingIn}
                  onSubscribe={() => membership.subscribe(BUYER_MESSAGES)}
                />
              </div>
            )}
          </div>
        )}
        <div className="creator-posts">
          {currentCreator.posts.length ? (
            currentCreator.posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                address={address}
                busy={busyPostId === post.id}
                approved={approvedPostId === post.id}
                onBuy={buyPost}
                owner={owner}
                deleting={deletingPostId === post.id}
                onDelete={deletePost}
              />
            ))
          ) : (
            <div className="empty-posts">
              <p>No posts yet.</p>
              {owner && (
                <Link className="secondary" to="/publish">
                  Publish a post
                </Link>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function VisibilityBadge({
  isPublic,
  onToggle,
  busy = false,
}: {
  isPublic: boolean;
  onToggle?: () => void;
  busy?: boolean;
}) {
  const label = isPublic ? "Public" : "Private";
  const className = `visibility-badge ${isPublic ? "is-public" : "is-private"}`;
  const content = (
    <>
      <span className="visibility-dot" aria-hidden="true" />
      {label}
    </>
  );
  if (!onToggle) return <span className={className}>{content}</span>;
  return (
    <button
      className={className}
      type="button"
      disabled={busy}
      title="Change visibility"
      onClick={onToggle}
    >
      {busy && <Spinner />}
      {content}
      <Icon name="edit" />
    </button>
  );
}

function SubscriptionAction({
  membership,
  stage,
  disabled,
  onSubscribe,
}: {
  membership: CreatorResponse["membership"];
  stage: SubscriptionStage;
  disabled: boolean;
  onSubscribe: () => Promise<void>;
}) {
  if (membership.active)
    return <span className="access-status">Subscribed</span>;
  if (membership.offered && membership.available === false)
    return <span className="access-status">Unavailable</span>;
  if (membership.canceled)
    return <span className="access-status">Subscription closed</span>;
  if (!membership.offered)
    return <span className="access-status">Subscription live</span>;
  return (
    <button
      className="primary"
      disabled={disabled}
      onClick={() => void onSubscribe()}
    >
      {stage !== null && <Spinner />}
      {buyerLabel(stage)}
    </button>
  );
}

function buyerLabel(stage: SubscriptionStage): string {
  if (stage === "confirming") return "Confirming...";
  if (stage === "preparing") return "Preparing...";
  return "Subscribe";
}

function PostCard({
  post,
  address,
  busy,
  approved,
  onBuy,
  owner,
  deleting,
  onDelete,
}: {
  post: PostResponse;
  address: string | null;
  busy: boolean;
  approved: boolean;
  onBuy: (post: PostResponse) => void;
  owner: boolean;
  deleting: boolean;
  onDelete: (post: PostResponse) => void;
}) {
  const free = isFreePost(post.priceSompi);
  const unlocked = free || post.canView;
  const postPath = `/post/${encodeURIComponent(post.id)}`;

  return (
    <PostTile
      media={
        unlocked ? (
          <PostTileMedia>
            <PostMedia post={post} />
          </PostTileMedia>
        ) : (
          <PostTileMedia>
            <div className="post-tile-locked">
              <LockIcon open={false} />
              <button
                className="buy"
                type="button"
                disabled={busy}
                onClick={() => onBuy(post)}
              >
                {busy && <Spinner />}
                {approved
                  ? "Unlocking..."
                  : busy
                    ? "Approve in wallet..."
                    : `Unlock for ${formatKas(post.priceSompi)} KAS`}
              </button>
            </div>
          </PostTileMedia>
        )
      }
      caption={post.caption}
      date={relativeTimeAgo(post.publishedAt)}
      to={postPath}
      mediaType={post.mediaType}
      metaAction={<ShareButton address={address} path={postPath} compact />}
      action={
        owner ? (
          <PostTileAction>
            <button
              className="icon-button danger-icon"
              type="button"
              disabled={deleting}
              onClick={() => onDelete(post)}
              aria-label="Delete"
              title="Delete"
            >
              {deleting ? <Spinner /> : <Icon name="trash" />}
            </button>
          </PostTileAction>
        ) : undefined
      }
    />
  );
}
