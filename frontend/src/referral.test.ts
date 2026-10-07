import {
  captureReferral,
  clearReferral,
  readReferral,
  referralShareUrl,
  REFERRAL_COOKIE,
} from "./referral.js";

const wallet =
  "kaspatest:qzexf809ys0ejw7n7r4srexxu3ye8j0pzsvelt7jx6h5fmlj2as9ueqrwty4k";

describe("referral link", () => {
  beforeEach(() => clearReferral());

  it("keeps the wallet named by a shared link", () => {
    captureReferral(`?ref=${encodeURIComponent(wallet)}`);
    expect(readReferral()).toBe(wallet);
  });

  it("ignores a ref that is not an address on the server's network", () => {
    captureReferral("?ref=not-an-address");
    expect(readReferral()).toBeNull();
  });

  it("ignores a link without a ref", () => {
    captureReferral("?utm_source=telegram");
    expect(readReferral()).toBeNull();
  });

  it("expires: no cookie means no referrer", () => {
    captureReferral(`?ref=${encodeURIComponent(wallet)}`);
    clearReferral();
    expect(document.cookie.includes(REFERRAL_COOKIE)).toBe(false);
    expect(readReferral()).toBeNull();
  });

  it("builds a share link that credits the sharer", () => {
    const url = new URL(referralShareUrl(wallet, "/post/abc"));
    expect(url.pathname).toBe("/post/abc");
    expect(url.searchParams.get("ref")).toBe(wallet);
  });
});
