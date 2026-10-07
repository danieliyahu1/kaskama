import { isAppAddress } from "./app-config.js";

/** The query parameter a shared link carries: `?ref=<wallet>`. */
export const REFERRAL_QUERY_PARAM = "ref";

/** Where a landed referral is kept until it expires. */
export const REFERRAL_COOKIE = "kaskama_ref";

/**
 * How long a landed referral lasts. A purchase credits a referrer only while
 * the link's cookie is still alive, so attribution always has an end.
 */
export const REFERRAL_TTL_SECONDS = 24 * 60 * 60;

/**
 * Remembers the wallet named by `?ref=` on a shared link, so a purchase made
 * later can credit it. Only an address valid for the
 * server's network is kept; anything else is ignored, so a bad link can never
 * break a sale.
 */
export function captureReferral(search: string): void {
  const value = new URLSearchParams(search).get(REFERRAL_QUERY_PARAM);
  if (!value || !isAppAddress(value)) return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${REFERRAL_COOKIE}=${encodeURIComponent(value)}; Max-Age=${REFERRAL_TTL_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

/** The wallet a purchase should credit, or null once the referral expired or was never set. */
export function readReferral(): string | null {
  const value = readCookie(REFERRAL_COOKIE);
  return value && isAppAddress(value) ? value : null;
}

export function clearReferral(): void {
  document.cookie = `${REFERRAL_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}

/**
 * A link to `path` that credits `address` for any purchase it drives. It is a
 * plain URL: the referral travels in the query string and then the cookie, and
 * nothing about the sharer is stored on the server.
 */
export function referralShareUrl(address: string, path: string): string {
  const url = new URL(path, window.location.origin);
  url.searchParams.set(REFERRAL_QUERY_PARAM, address);
  return url.toString();
}

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const entry = part.trim();
    if (entry.startsWith(prefix)) return decodeURIComponent(entry.slice(prefix.length));
  }
  return null;
}
