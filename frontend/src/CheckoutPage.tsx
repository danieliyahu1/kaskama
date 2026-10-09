import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { type CreatorResponse } from "@kaskama/shared";
import { api } from "./kasware.js";
import { CreatorAvatar } from "./CreatorAvatar.js";
import { Spinner } from "./Spinner.js";
import { useToast } from "./Toast.js";
import { Message } from "./Message.js";
import { COPY } from "./copy.js";
import { errorText } from "./errors.js";
import { presentError } from "./error-toast.js";
import { formatKas } from "./format.js";
import { Icon } from "./Icons.js";
import type { WalletProps } from "./wallet.js";
import { useMembershipActions } from "./membership-actions.js";
import {
  checkoutPath,
  creatorAddressFromRoute,
  hasAddressPrefix,
} from "./creator-url.js";

/** The longest a display name may be, matching the server's rule. */
const DISPLAY_NAME_MAX = 40;
const DEFAULT_PRICE = "10";

/**
 * The checkout. For a buyer it is the seller's identity and their subscription,
 * and nothing else — the profile stripped of everything that is not the payment.
 * For the seller it is the whole management surface: set a name, set a price,
 * start, update, or cancel the subscription — so once they are here they never
 * need to leave to initialize or manage it. The membership actions are the same
 * shared ones the profile page uses; only the layout differs.
 */
export function CheckoutPage({ address, signIn, signingIn }: WalletProps) {
  const navigate = useNavigate();
  const { address: routeAddress = "" } = useParams();
  const sellerAddress = creatorAddressFromRoute(routeAddress);
  const [seller, setSeller] = useState<CreatorResponse | null>(null);
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [price, setPrice] = useState(DEFAULT_PRICE);
  const [editingPrice, setEditingPrice] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { showToast, dismissToast } = useToast();
  const requestId = useRef(0);

  async function loadSeller() {
    const currentRequest = ++requestId.current;
    const isNewSeller = seller?.address !== sellerAddress;
    if (isNewSeller) {
      setLoading(true);
      setSeller(null);
    }
    setLoadError(null);
    try {
      const value = await api<CreatorResponse>(
        `/api/creators/${encodeURIComponent(sellerAddress)}`,
      );
      if (currentRequest === requestId.current) {
        setSeller(value);
        if (value.membership.priceSompi)
          setPrice(formatKas(value.membership.priceSompi));
      }
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      const message = errorText(error, COPY.checkoutSellerMissing);
      if (isNewSeller) setLoadError(message);
      else showToast(message, "error");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }

  const membership = useMembershipActions({
    creator: sellerAddress,
    address,
    signIn,
    reload: loadSeller,
  });

  useEffect(() => {
    if (hasAddressPrefix(routeAddress)) {
      navigate(checkoutPath(sellerAddress), { replace: true });
      return;
    }
    void loadSeller();
  }, [sellerAddress, address, navigate, routeAddress]);

  if (loading)
    return (
      <Message title="Loading..." center>
        <Spinner />
      </Message>
    );
  if (!seller)
    return <Message title={loadError ?? COPY.checkoutSellerMissing} />;

  const owner = address === seller.address;
  const offerUnavailable =
    seller.membership.offered && seller.membership.available === false;
  const durationDays = seller.membership.durationDays ?? 30;
  const priceLabel = seller.membership.priceSompi
    ? `${formatKas(seller.membership.priceSompi)} KAS · ${durationDays} days`
    : `${durationDays} days`;

  /**
   * The owner can set a name here, on the checkout page itself, so being
   * uninitialized is one step from fixed instead of a trip to another screen.
   */
  async function saveName(event: FormEvent) {
    event.preventDefault();
    const displayName = name.trim();
    if (!displayName) return;
    setSavingName(true);
    dismissToast();
    try {
      await api("/api/profile", {
        method: "PUT",
        body: JSON.stringify({ displayName }),
      });
      showToast(COPY.checkoutNameSaved, "success");
      await loadSeller();
    } catch (error) {
      showToast(
        presentError(error, COPY.checkoutNameSaveFailed).message,
        "error",
      );
    } finally {
      setSavingName(false);
    }
  }

  function startSubscription() {
    return membership.startOffer(price, {
      confirmed: COPY.checkoutStarted,
      pending: COPY.purchasePending,
      failed: COPY.checkoutStartFailed,
    });
  }

  function updatePrice() {
    return membership
      .updatePrice(price, {
        confirmed: COPY.checkoutPriceUpdated,
        pending: COPY.purchasePending,
        failed: COPY.checkoutPriceFailed,
      })
      .then(() => setEditingPrice(false));
  }

  function cancelSubscription() {
    return membership.cancel({
      confirmed: COPY.checkoutCanceled,
      pending: COPY.purchasePending,
      failed: COPY.checkoutCancelFailed,
      confirm: COPY.checkoutCancelConfirm,
    });
  }

  function subscribe() {
    return membership.subscribe({
      confirmed: `Subscribed for ${durationDays} days.`,
      pending: COPY.purchasePending,
      failed: COPY.checkoutPaymentFailed,
    });
  }

  async function copyCheckoutLink() {
    try {
      await navigator.clipboard.writeText(
        new URL(checkoutPath(seller!.address), window.location.origin).toString(),
      );
      showToast(COPY.checkoutLinkCopied, "success");
    } catch {
      showToast(COPY.shareFailed, "error");
    }
  }

  if (offerUnavailable)
    return (
      <Message
        title={
          owner
            ? COPY.checkoutOfferNotServiceable
            : COPY.checkoutSubscriptionUnavailable
        }
      >
        {owner && (
          <p className="checkout-note">{COPY.checkoutOfferNotServiceableNote}</p>
        )}
      </Message>
    );

  if (owner && !seller.displayName)
    return (
      <Message title={COPY.checkoutNameRequired}>
        <form
          className="checkout-name"
          onSubmit={(event) => void saveName(event)}
        >
          <label htmlFor="checkout-name">{COPY.checkoutNameLabel}</label>
          <div className="checkout-name-row">
            <input
              id="checkout-name"
              name="displayName"
              autoComplete="nickname"
              maxLength={DISPLAY_NAME_MAX}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={savingName}
            />
            <button
              className="primary"
              type="submit"
              disabled={savingName || name.trim().length === 0}
            >
              {savingName && <Spinner />}
              {COPY.checkoutSaveName}
            </button>
          </div>
        </form>
        <p className="checkout-note">{COPY.checkoutOwnerNote}</p>
      </Message>
    );

  if (!owner && (!seller.displayName || !seller.membership.offered))
    return <Message title={COPY.checkoutUnavailable} />;

  const busy = membership.busy;
  const stage = membership.stage;
  const priceField = (
    <span className="price-input subscription-price">
      <input
        inputMode="decimal"
        value={price}
        onChange={(event) => setPrice(event.target.value)}
        disabled={busy}
        aria-label={COPY.checkoutPriceLabel}
      />
      <span className="price-unit">KAS</span>
    </span>
  );

  function ownerControls() {
    if (!seller!.membership.offered)
      return (
        <div className="checkout-offer">
          <p className="access-facts">{COPY.checkoutStartHint}</p>
          <div className="subscription-form">
            {priceField}
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void startSubscription()}
            >
              {busy && <Spinner />}
              {COPY.checkoutStart}
            </button>
          </div>
        </div>
      );
    return (
      <>
        <div className="checkout-offer">
          <p className="access-facts">{priceLabel}</p>
          <div className="access-actions">
            {editingPrice ? (
              <>
                {priceField}
                <button
                  type="button"
                  className="icon-button"
                  disabled={busy}
                  aria-label="Save price"
                  title="Save price"
                  onClick={() => void updatePrice()}
                >
                  {busy ? <Spinner /> : <Icon name="check" />}
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={busy}
                  aria-label="Cancel"
                  title="Cancel"
                  onClick={() => setEditingPrice(false)}
                >
                  <span className="icon-button-glyph" aria-hidden="true">
                    &times;
                  </span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setEditingPrice(true)}
                >
                  {COPY.checkoutUpdatePrice}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void copyCheckoutLink()}
                >
                  {COPY.checkoutCopyLink}
                </button>
                <button
                  type="button"
                  className="icon-button danger-icon"
                  disabled={busy}
                  aria-label="Delete subscription"
                  title="Delete subscription"
                  onClick={() => void cancelSubscription()}
                >
                  <Icon name="trash" />
                </button>
              </>
            )}
          </div>
        </div>
        <p className="checkout-note">{COPY.checkoutPreview}</p>
      </>
    );
  }

  function buyerControls() {
    if (seller!.membership.active)
      return (
        <div className="checkout-offer">
          <p className="access-facts">{priceLabel}</p>
          <div className="access-actions">
            <span className="access-status">{COPY.checkoutSubscribed}</span>
          </div>
        </div>
      );
    const label =
      stage === "confirming"
        ? COPY.checkoutConfirming
        : stage === "preparing"
          ? COPY.checkoutPreparing
          : COPY.checkoutSubscribe;
    return (
      <div className="checkout-offer">
        <p className="access-facts">{priceLabel}</p>
        <div className="access-actions">
          <button
            type="button"
            className="primary"
            disabled={busy || signingIn}
            onClick={() => void subscribe()}
          >
            {busy && <Spinner />}
            {label}
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="checkout">
      <div className="checkout-seller">
        <CreatorAvatar avatarUrl={seller.avatarUrl} />
        <div className="checkout-identity">
          <p className="checkout-kicker">{COPY.checkoutKicker}</p>
          <h1>{seller.displayName}</h1>
        </div>
      </div>
      {owner ? ownerControls() : buyerControls()}
    </section>
  );
}
