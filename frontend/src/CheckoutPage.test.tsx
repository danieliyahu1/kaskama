import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CheckoutPage } from "./CheckoutPage.js";
import { compactAddress, shortenAddress } from "./format.js";
import { api, signPreparedPayment, WalletNetworkError } from "./kasware.js";
import { COPY } from "./copy.js";
import {
  consumerAddress,
  creator,
  creatorAddress,
  ToastSlot,
} from "./test-fixtures.js";

vi.mock("./kasware.js", async () => ({
  ...(await vi.importActual("./kasware.js")),
  api: vi.fn(),
  signPreparedPayment: vi.fn(),
}));

function renderCheckout(address: string | null, signIn = vi.fn(async () => address)) {
  render(
    <MemoryRouter initialEntries={[`/checkout/${creatorAddress}`]}>
      <Routes>
        <Route
          path="/checkout/:address"
          element={<CheckoutPage address={address} signIn={signIn} signingIn={false} />}
        />
      </Routes>
      <ToastSlot />
    </MemoryRouter>,
  );
}

const writeText = vi.fn().mockResolvedValue(undefined);

describe("CheckoutPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  it("shows the seller's wallet address and copies it", async () => {
    vi.mocked(api).mockResolvedValueOnce(creator(false, true));
    renderCheckout(consumerAddress);

    expect(await screen.findByText(shortenAddress(creatorAddress))).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Copy Kaspa address" }));
    expect(writeText).toHaveBeenCalledWith(creatorAddress);
  });

  it("lets a visitor subscribe to a named seller", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce(creator(false, true))
      .mockResolvedValueOnce({ id: "purchase", transaction: "{}", signInputs: [1] })
      .mockResolvedValueOnce({ state: "CONFIRMED" })
      .mockResolvedValueOnce(creator(false, true, true));
    vi.mocked(signPreparedPayment).mockResolvedValue("signed");
    const user = userEvent.setup();
    renderCheckout(consumerAddress);

    await user.click(await screen.findByRole("button", { name: "Subscribe" }));

    expect(api).toHaveBeenCalledWith(
      `/api/membership/${encodeURIComponent(creatorAddress)}/prepare`,
      { method: "POST" },
    );
    expect(signPreparedPayment).toHaveBeenCalledWith("{}", [1]);
    expect(api).toHaveBeenCalledWith("/api/membership/purchases/purchase/finalize", {
      method: "POST",
      body: JSON.stringify({ signedTransaction: "signed" }),
    });
    expect(await screen.findByText("Subscribed")).toBeVisible();
  });

  it("signs a signed-out visitor in before subscribing", async () => {
    const signIn = vi.fn(async () => consumerAddress);
    vi.mocked(api)
      .mockResolvedValueOnce(creator(false, true))
      .mockResolvedValueOnce({ id: "purchase", transaction: "{}", signInputs: [1] })
      .mockResolvedValueOnce({ state: "CONFIRMED" })
      .mockResolvedValueOnce(creator(false, true, true));
    vi.mocked(signPreparedPayment).mockResolvedValue("signed");
    const user = userEvent.setup();
    renderCheckout(null, signIn);

    await user.click(await screen.findByRole("button", { name: "Subscribe" }));

    expect(signIn).toHaveBeenCalled();
    expect(api).toHaveBeenCalledWith(
      `/api/membership/${encodeURIComponent(creatorAddress)}/prepare`,
      { method: "POST" },
    );
    expect(await screen.findByText("Subscribed")).toBeVisible();
  });

  it("shows a subscriber their status without a renewal action", async () => {
    vi.mocked(api).mockResolvedValueOnce(creator(false, true, true));
    renderCheckout(consumerAddress);

    expect(await screen.findByText("Subscribed")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /renew/i }),
    ).not.toBeInTheDocument();
  });

  it("shows a nameless seller's checkout under their wallet address", async () => {
    vi.mocked(api).mockResolvedValueOnce({
      ...creator(false, true),
      displayName: null,
    });
    renderCheckout(consumerAddress);

    expect(
      await screen.findByRole("heading", {
        name: compactAddress(creatorAddress),
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Subscribe" })).toBeVisible();
  });

  it("lets a nameless owner manage their checkout", async () => {
    vi.mocked(api).mockResolvedValueOnce({
      ...creator(true, true),
      displayName: null,
    });
    renderCheckout(creatorAddress);

    expect(
      await screen.findByRole("heading", {
        name: compactAddress(creatorAddress),
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: COPY.checkoutUpdatePrice }),
    ).toBeVisible();
  });

  it("tells a visitor the creator hasn't set up checkout yet", async () => {
    vi.mocked(api).mockResolvedValueOnce(creator(false, false));
    renderCheckout(consumerAddress);

    expect(await screen.findByText(COPY.checkoutUnavailable)).toBeVisible();
  });

  it("refuses to sell a subscription the backend can't serve", async () => {
    vi.mocked(api).mockResolvedValueOnce({
      ...creator(false, true),
      membership: { offered: true, active: false, available: false },
    });
    renderCheckout(consumerAddress);

    expect(await screen.findByText(COPY.checkoutSubscriptionUnavailable)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Subscribe" })).not.toBeInTheDocument();
  });

  it("tells the owner their subscription isn't serviceable", async () => {
    vi.mocked(api).mockResolvedValueOnce({
      ...creator(true, true),
      membership: { offered: true, active: false, available: false },
    });
    renderCheckout(creatorAddress);

    expect(await screen.findByText(COPY.checkoutOfferNotServiceable)).toBeVisible();
    expect(screen.getByText(COPY.checkoutOfferNotServiceableNote)).toBeVisible();
  });

  it("shows the owner a shareable preview instead of a pay button", async () => {
    vi.mocked(api).mockResolvedValueOnce(creator(true, true));
    renderCheckout(creatorAddress);

    expect(
      await screen.findByRole("button", { name: COPY.checkoutCopyLink }),
    ).toBeVisible();
    expect(screen.getByText(COPY.checkoutPreview)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Subscribe" })).not.toBeInTheDocument();
  });

  it("lets the owner start the subscription from checkout", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce(creator(true, false))
      .mockResolvedValueOnce({ id: "offer", transaction: "{}", signInputs: [0] })
      .mockResolvedValueOnce({ state: "CONFIRMED" })
      .mockResolvedValueOnce(creator(true, true));
    vi.mocked(signPreparedPayment).mockResolvedValue("signed");
    const user = userEvent.setup();
    renderCheckout(creatorAddress);

    await user.click(await screen.findByRole("button", { name: COPY.checkoutStart }));

    expect(api).toHaveBeenCalledWith("/api/membership/offers/prepare", {
      method: "POST",
      body: JSON.stringify({ price: "10" }),
    });
    expect(signPreparedPayment).toHaveBeenCalledWith("{}", [0]);
    expect(api).toHaveBeenCalledWith("/api/membership/offers/offer/finalize", {
      method: "POST",
      body: JSON.stringify({ signedTransaction: "signed" }),
    });
    expect(
      await screen.findByRole("button", { name: COPY.checkoutCopyLink }),
    ).toBeVisible();
  });

  it("lets the owner update the price from checkout", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce(creator(true, true))
      .mockResolvedValueOnce({ id: "update", transaction: "{}", signInputs: [1] })
      .mockResolvedValueOnce({ state: "CONFIRMED" })
      .mockResolvedValueOnce(creator(true, true));
    vi.mocked(signPreparedPayment).mockResolvedValue("signed");
    const user = userEvent.setup();
    renderCheckout(creatorAddress);

    await user.click(
      await screen.findByRole("button", { name: COPY.checkoutUpdatePrice }),
    );
    const field = screen.getByLabelText(COPY.checkoutPriceLabel);
    await user.clear(field);
    await user.type(field, "25");
    await user.click(screen.getByRole("button", { name: "Save price" }));

    expect(api).toHaveBeenCalledWith("/api/membership/price/prepare", {
      method: "POST",
      body: JSON.stringify({ price: "25" }),
    });
    expect(api).toHaveBeenCalledWith("/api/membership/price/update/finalize", {
      method: "POST",
      body: JSON.stringify({ signedTransaction: "signed" }),
    });
  });

  it("lets the owner cancel the subscription from checkout", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce(creator(true, true))
      .mockResolvedValueOnce({ id: "cancel", transaction: "{}", signInputs: [1] })
      .mockResolvedValueOnce({ state: "CONFIRMED" })
      .mockResolvedValueOnce(creator(true, false));
    vi.mocked(signPreparedPayment).mockResolvedValue("signed");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderCheckout(creatorAddress);

    await user.click(
      await screen.findByRole("button", { name: "Delete subscription" }),
    );

    expect(api).toHaveBeenCalledWith("/api/membership/cancel/prepare", {
      method: "POST",
    });
    expect(api).toHaveBeenCalledWith("/api/membership/cancel/cancel/finalize", {
      method: "POST",
      body: JSON.stringify({ signedTransaction: "signed" }),
    });
  });

  it("stays quiet when the wallet needs a network switch", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce(creator(false, true))
      .mockResolvedValueOnce({ id: "purchase", transaction: "{}", signInputs: [1] });
    vi.mocked(signPreparedPayment).mockRejectedValue(
      new WalletNetworkError(COPY.wrongNetwork),
    );
    const user = userEvent.setup();
    renderCheckout(consumerAddress);

    await user.click(await screen.findByRole("button", { name: "Subscribe" }));

    expect(await screen.findByRole("button", { name: "Subscribe" })).toBeEnabled();
    expect(screen.queryByText(COPY.wrongNetwork)).not.toBeInTheDocument();
  });
});
