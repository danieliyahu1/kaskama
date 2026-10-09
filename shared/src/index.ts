import { MEDIA_COPY, type MediaType } from "./media.js";

export * from "./public-pages.js";
export * from "./media.js";
export * from "./social-links.js";

export type NetworkId = "mainnet" | "testnet-10";

export interface NetworkDefinition {
  id: NetworkId;
  /** The value Kasware expects from `getNetwork`/`switchNetwork`. */
  walletNetwork: string;
  /** The human-readable network name shown to people. */
  displayName: string;
  /** The human-readable address prefix, without the trailing colon. */
  addressPrefix: string;
  addressPattern: RegExp;
  defaultNodeUrl: string;
  /** Base URL of the covenant explorer, where an offer can be verified. */
  covenantExplorerUrl: string;
}

export const NETWORK_DEFINITIONS: Record<NetworkId, NetworkDefinition> = {
  mainnet: {
    id: "mainnet",
    walletNetwork: "kaspa_mainnet",
    displayName: "Mainnet",
    addressPrefix: "kaspa",
    addressPattern: /^kaspa:[a-z0-9]{40,80}$/,
    defaultNodeUrl: "https://api.kaspa.org",
    covenantExplorerUrl: "https://covenants.kaspa.com",
  },
  "testnet-10": {
    id: "testnet-10",
    walletNetwork: "kaspa_testnet_10",
    displayName: "Testnet 10",
    addressPrefix: "kaspatest",
    addressPattern: /^kaspatest:[a-z0-9]{40,80}$/,
    defaultNodeUrl: "https://api-tn10.kaspa.org",
    covenantExplorerUrl: "https://tn10-covenants.kaspa.com",
  },
};

export const DEFAULT_NETWORK: NetworkId = "testnet-10";

export function isNetworkId(value: string): value is NetworkId {
  return value === "mainnet" || value === "testnet-10";
}

export function networkDefinition(network: NetworkId): NetworkDefinition {
  return NETWORK_DEFINITIONS[network];
}

export function isAddressForNetwork(network: NetworkId, value: string): boolean {
  return networkDefinition(network).addressPattern.test(value);
}

export const KASPA_TESTNET_ADDRESS_PATTERN =
  NETWORK_DEFINITIONS["testnet-10"].addressPattern;
export const KASPA_MAINNET_ADDRESS_PATTERN = NETWORK_DEFINITIONS.mainnet.addressPattern;

/** The server's authoritative network identity, served to the browser. */
export interface NetworkConfigResponse {
  network: NetworkId;
  walletNetwork: string;
  addressPrefix: string;
}

export const FEEDBACK_MAX_MESSAGE = 1500;
export const MIN_MEMBERSHIP_PRICE_SOMPI = 100_000_000n;
export const MAX_MEMBERSHIP_PRICE_SOMPI = 100_000_000_000_000n;
export const MEMBERSHIP_DURATION_DAA = 25_920_000n;

/**
 * A generic, client-agnostic hint attached to a failed response. It tells any
 * caller what the state of the resource allows, without naming a domain code.
 * `AFTER_REFRESH` means the resource changed underneath the request: refetch
 * it, then the caller may submit again.
 */
export const RETRY_AFTER_REFRESH = "AFTER_REFRESH" as const;
export type ApiRetry = typeof RETRY_AFTER_REFRESH;

export interface PostResponse {
  id: string;
  creator: string;
  caption: string;
  priceSompi: string;
  mediaType: MediaType;
  publishedAt: string;
  canView: boolean;
}

export interface CreatorResponse {
  address: string;
  displayAddress: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
  isOwner: boolean;
  membership: {
    offered: boolean;
    /**
     * Whether the offer can currently be served: its covenant output is on
     * chain and the transaction behind it is readable. A database row alone
     * does not mean the subscription is live.
     */
    available?: boolean;
    canceled?: boolean;
    active: boolean;
    priceSompi?: string | null;
    durationDays?: number | null;
    version?: number | null;
    /**
     * The covenant id of the live offer, for verifying it on-chain. Present only
     * when an offer exists.
     */
    covenantId?: string | null;
  };
  posts: PostResponse[];
}

/** The subscription a creator offers, as listed in the directory. */
export interface MembershipSummary {
  offered: boolean;
  priceSompi: string | null;
  durationDays: number;
}

export interface CreatorSearchResult {
  address: string;
  displayAddress: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  /** When the creator last posted, shown as a sign they are still around. */
  lastPostedAt: string | null;
  membership: MembershipSummary;
}

export interface ProfileResponse {
  address: string;
  displayAddress: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
}

/** The identity of the current session, returned to any client. */
export interface CurrentSessionResponse {
  address: string;
  displayName: string | null;
  expiresAt: string;
}

export interface MembershipCheckResponse {
  transactionId: string;
  outputIndex: number;
  covenantId: string | null;
  kind: "token" | "none";
  tokenType: "membership" | null;
  owner: string | null;
  contentCreator: string | null;
  platformAddress: string | null;
  createdAtDaa: string | null;
  expiresAtDaa: string | null;
  createdAt: string | null;
  validUntil: string | null;
  status: "VALID" | "EXPIRED" | "OWNER_MISMATCH" | "NOT_MEMBERSHIP";
}

export interface MembershipAddressVerificationResponse {
  address: string;
  verifiedAt: string;
  valid: boolean;
  memberships: MembershipCheckResponse[];
}

export function normalizePostText(value: string): string {
  return value.trim();
}

export function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** The longest a display name may be. */
export const MAX_DISPLAY_NAME_LENGTH = 40;

export function validateDisplayName(value: string): string | null {
  const name = normalizeDisplayName(value);
  if (Array.from(name).length > MAX_DISPLAY_NAME_LENGTH)
    return `Names can be up to ${MAX_DISPLAY_NAME_LENGTH} characters.`;
  return name.length === 0 ? null : name;
}

/** The longest a creator's bio may be. */
export const MAX_BIO_LENGTH = 120;

export function normalizeBio(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function validateBio(value: string): string | null {
  const text = normalizeBio(value);
  if (Array.from(text).length > MAX_BIO_LENGTH)
    return `A bio can be up to ${MAX_BIO_LENGTH} characters.`;
  return text.length === 0 ? null : text;
}

export function isKaspaTestnetAddress(value: string): boolean {
  return KASPA_TESTNET_ADDRESS_PATTERN.test(value);
}

export function parseKasToSompi(value: string): bigint | null {
  const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(value.trim());
  if (!match || !match[1]) return null;
  const sompi =
    BigInt(match[1]) * 100_000_000n + BigInt((match[2] ?? "").padEnd(8, "0"));
  return sompi > 0n ? sompi : null;
}

export type MembershipPriceProblem = "EMPTY" | "FORMAT" | "BELOW_MIN" | "ABOVE_MAX";

/**
 * The single grammar for a monthly price. Returns null when the value is
 * acceptable, or the reason it is not, so the caller can explain the failure.
 */
export function membershipPriceProblem(value: string): MembershipPriceProblem | null {
  const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(value.trim());
  if (!match || !match[1]) return value.trim() ? "FORMAT" : "EMPTY";
  const sompi =
    BigInt(match[1]) * 100_000_000n + BigInt((match[2] ?? "").padEnd(8, "0"));
  if (sompi < MIN_MEMBERSHIP_PRICE_SOMPI) return "BELOW_MIN";
  if (sompi > MAX_MEMBERSHIP_PRICE_SOMPI) return "ABOVE_MAX";
  return null;
}

export function parseMembershipPrice(value: string): bigint | null {
  if (membershipPriceProblem(value) !== null) return null;
  return parseKasToSompi(value);
}

export function membershipFeeSompi(priceSompi: bigint): bigint {
  const fee = (priceSompi + 50n) / 100n;
  return fee >= 100_000_000n ? fee : 0n;
}

export function parsePostPrice(value: string): bigint | null {
  const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(value.trim());
  if (!match || !match[1]) return null;
  return BigInt(match[1]) * 100_000_000n + BigInt((match[2] ?? "").padEnd(8, "0"));
}

export function isFreePost(priceSompi: string): boolean {
  return priceSompi === "0";
}

export function validatePost(caption: string, price: string): string[] {
  const errors: string[] = [];
  const normalizedCaption = normalizePostText(caption);
  if (
    Array.from(normalizedCaption).length < 1 ||
    Array.from(normalizedCaption).length > 280
  )
    errors.push("Caption must be between 1 and 280 characters.");
  if (parsePostPrice(price) === null) errors.push(MEDIA_COPY.invalidPrice);
  return errors;
}
