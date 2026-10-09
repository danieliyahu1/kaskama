import { useEffect, useRef, useState } from "react";
import { type CreatorResponse } from "@kaskama/shared";
import { api } from "./kasware.js";
import { Icon } from "./Icons.js";
import { Spinner } from "./Spinner.js";
import { COPY } from "./copy.js";
import { errorText } from "./errors.js";
import { formatKas } from "./format.js";
import {
  useMembershipActions,
  type SubscriptionStage,
} from "./membership-actions.js";
import {
  CANCEL_MESSAGES,
  START_MESSAGES,
  UPDATE_MESSAGES,
} from "./membership-messages.js";

const DEFAULT_PRICE = "10";

type SubscriptionSettingsProps = {
  address: string;
  signIn: () => Promise<string | null>;
  signingIn: boolean;
};

/**
 * The owner's subscription, moved off the public creator page and into the one
 * surface where a creator edits their own things. Selling is an edit, so it
 * lives here; buying stays on the creator page, where the buyer already is.
 */
export function SubscriptionSettings({
  address,
  signIn,
  signingIn,
}: SubscriptionSettingsProps) {
  const [owner, setOwner] = useState<CreatorResponse | null>(null);
  const [price, setPrice] = useState(DEFAULT_PRICE);
  const [editingPrice, setEditingPrice] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const loaded = useRef(false);

  useEffect(() => {
    let active = true;
    if (!loaded.current) setLoading(true);
    setError(null);
    void api<CreatorResponse>(`/api/creators/${encodeURIComponent(address)}`)
      .then((value) => {
        if (!active) return;
        setOwner(value);
        loaded.current = true;
        if (value.membership.priceSompi)
          setPrice(formatKas(value.membership.priceSompi));
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(errorText(caught, "Your subscription could not be loaded."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [address, reloadKey]);

  const reload = () => setReloadKey((key) => key + 1);

  const membership = useMembershipActions({
    creator: address,
    address,
    signIn,
    reload,
  });

  const busy = membership.busy || signingIn;

  if (loading && !owner)
    return (
      <section className="edit-profile-subscription">
        <h2>Subscription</h2>
        <Spinner />
      </section>
    );

  if (!owner)
    return (
      <section className="edit-profile-subscription">
        <h2>Subscription</h2>
        <p className="edit-profile-note">
          {error ?? "Your subscription could not be loaded."}
        </p>
        <button className="secondary" type="button" onClick={reload}>
          Try again
        </button>
      </section>
    );

  const unavailable =
    owner.membership.offered && owner.membership.available === false;
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

  return (
    <section className="edit-profile-subscription">
      <h2>Subscription</h2>
      {owner.membership.offered ? (
        <>
          <p className="access-facts">
            {unavailable
              ? "unavailable"
              : owner.membership.priceSompi
                ? `${formatKas(owner.membership.priceSompi)} KAS · ${owner.membership.durationDays ?? 30} days`
                : `${owner.membership.durationDays ?? 30} days`}
          </p>
          <div className="access-actions">
            {editingPrice ? (
              <>
                {priceField}
                <button
                  className="icon-link"
                  disabled={busy}
                  aria-label="Save price"
                  title="Save price"
                  onClick={() =>
                    void membership
                      .updatePrice(price, UPDATE_MESSAGES)
                      .then(() => setEditingPrice(false))
                  }
                >
                  {busy ? <Spinner /> : <Icon name="check" />}
                </button>
                <button
                  className="icon-link"
                  type="button"
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
                  className="icon-link"
                  disabled={busy}
                  aria-label="Update price"
                  title="Update price"
                  onClick={() => setEditingPrice(true)}
                >
                  <Icon name="edit" />
                </button>
                <button
                  className="icon-link danger-icon"
                  type="button"
                  disabled={busy}
                  aria-label="Delete subscription"
                  title="Delete subscription"
                  onClick={() => void membership.cancel(CANCEL_MESSAGES)}
                >
                  <Icon name="trash" />
                </button>
              </>
            )}
          </div>
          {unavailable && (
            <p className="edit-profile-note">
              {COPY.checkoutOfferNotServiceableNote}
            </p>
          )}
          {error && <p className="edit-profile-note">{error}</p>}
        </>
      ) : (
        <div className="subscription-form">
          {priceField}
          <button
            className="primary"
            disabled={busy}
            onClick={() => void membership.startOffer(price, START_MESSAGES)}
          >
            {busy && <Spinner />}
            {startLabel(membership.stage)}
          </button>
        </div>
      )}
    </section>
  );
}

function startLabel(stage: SubscriptionStage): string {
  if (stage === "confirming") return "Confirming...";
  if (stage === "preparing") return "Starting...";
  return "Start subscription";
}
