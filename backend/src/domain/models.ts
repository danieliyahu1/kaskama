import type { MediaType } from "@kaskama/shared";

export interface Challenge {
  id: string;
  nonce: string;
  address: string;
  origin: string;
  network: string;
  message: string;
  expiresAt: number;
  consumedAt: number | null;
}

export interface Session {
  id: string;
  address: string;
  expiresAt: number;
}

export interface Profile {
  address: string;
  displayName: string | null;
  bio: string | null;
  avatarKey: string | null;
  avatarType: MediaType | null;
  isPublic: boolean;
  updatedAt: number;
}

export interface Post {
  id: string;
  creator: string;
  caption: string;
  priceSompi: string;
  mediaType: MediaType;
  mediaSize: number;
  mediaDigest: string;
  mediaKey: string;
  publishedAt: number;
}

export interface Purchase {
  postId: string;
  buyer: string;
  transactionId: string;
}

/**
 * The signed transaction a client submitted, kept so reads (purchase access,
 * membership verification) can be answered from evidence we captured rather
 * than re-fetching the transaction from a node whose index may not serve it.
 */
export interface TransactionEvidence {
  transactionId: string;
  transaction: string;
  acceptedAt: number;
}

export interface PreparedPayment {
  transaction: string;
  fingerprint: string;
  amountSompi: string;
  creator: string;
}

export interface PaymentSubmission {
  isAccepted: boolean | null;
  transactionId: string | null;
  rejection: string | null;
}

/**
 * The result of putting a signed membership transaction on the network. It is
 * transport only: a transaction id means the node took the transaction, and
 * says nothing about whether it has taken effect on the ledger.
 */
export interface MembershipSubmission {
  transactionId: string | null;
  rejection: string | null;
}

/**
 * The immutable contract code a covenant was created with, split around the
 * state span. Persisted with the covenant so an offer's on-chain identity is
 * data, not a recomputation from whatever contract artifact happens to be
 * compiled into the running server.
 */
export interface MembershipContract {
  /** Contract bytecode before the state span, hex. */
  prefix: string;
  /** Contract bytecode after the state span, hex. */
  suffix: string;
}

export interface CreatorCovenant {
  creator: string;
  covenantId: string;
  priceSompi: string;
  status?: "ACTIVE" | "CANCELED";
  contract?: MembershipContract;
}

export interface MembershipPurchase {
  transactionId: string;
  buyer: string;
  creator: string;
  covenantId?: string | undefined;
}

export interface PreparedMembershipTransaction {
  transaction: string;
  fingerprint: string;
  covenantId: string;
  signInputs: number[];
  memberOutputIndex: number | null;
  priceSompi?: string | undefined;
  contract?: MembershipContract;
}

export interface PaymentAttempt {
  id: string;
  transaction: string;
  fingerprint: string;
  amountSompi: string;
  creator: string;
  postId: string;
  buyer: string;
  expiresAt: number;
}

export type PaymentAttemptState = "SUBMITTED" | "CONFIRMED" | "REJECTED";

export interface PaymentAttemptStatus {
  preparedPaymentId: string;
  state: PaymentAttemptState;
  transactionId: string;
  rejection: string | null;
  /** First time this transaction was persisted as in flight, in epoch ms. */
  submittedAt?: number | null;
  /** First time the reconciler observed a terminal outcome for this attempt. */
  finalizedAt?: number | null;
}

export interface MembershipAttempt {
  id: string;
  transaction: string;
  fingerprint: string;
  covenantId: string;
  signInputs: number[];
  memberOutputIndex: number | null;
  creator: string;
  buyer: string;
  kind: "offer" | "purchase" | "update" | "cancel";
  expiresAt: number;
  priceSompi?: string | undefined;
  contract?: MembershipContract;
}

export type MembershipAttemptState = "SUBMITTED" | "CONFIRMED" | "REJECTED";

export interface MembershipAttemptStatus {
  preparedMembershipId: string;
  state: MembershipAttemptState;
  transactionId: string;
  rejection: string | null;
  /** First time this transaction was persisted as in flight, in epoch ms. */
  submittedAt?: number | null;
  /** First time the reconciler observed a terminal outcome for this attempt. */
  finalizedAt?: number | null;
}

export type MembershipCheckStatus =
  "VALID" | "EXPIRED" | "OWNER_MISMATCH" | "NOT_MEMBERSHIP";

export interface MembershipCheck {
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
  status: MembershipCheckStatus;
}
