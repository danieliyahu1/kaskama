import type {
  Challenge,
  CreatorCovenant,
  MembershipCheck,
  MembershipContract,
  MembershipPurchase,
  Post,
  MembershipAttempt,
  PreparedMembershipTransaction,
  MembershipSubmission,
  MembershipAttemptStatus,
  MembershipAttemptState,
  PaymentAttempt,
  PreparedPayment,
  PaymentSubmission,
  PaymentAttemptStatus,
  PaymentAttemptState,
  Profile,
  Purchase,
  Session,
  TransactionEvidence,
} from "../domain/models.js";

export type DuplicateOutcome = "CREATED" | "DUPLICATE";

export interface ChallengeRepository {
  createChallenge(value: Challenge): Promise<void>;
  consumeChallenge(id: string, now: number): Promise<Challenge | null>;
  pruneChallenges(now: number): Promise<void>;
}

export interface SessionRepository {
  createSession(value: Session): Promise<void>;
  getSession(id: string, now: number): Promise<Session | null>;
  rollSession(id: string, expiresAt: number): Promise<void>;
  deleteSession(id: string): Promise<void>;
  pruneSessions(now: number): Promise<void>;
}

export interface PaymentAttemptRepository {
  savePaymentAttempt(value: PaymentAttempt): Promise<void>;
  getPaymentAttempt(id: string, now: number): Promise<PaymentAttempt | null>;
  /**
   * Reads an attempt by id for the reconciler, ignoring the client-facing TTL.
   * The TTL bounds how long a *client* may finalize; it must not bound how long
   * the server settles a transaction it already broadcast.
   */
  getPaymentAttemptForSettlement(id: string): Promise<PaymentAttempt | null>;
  prunePaymentAttempts(now: number): Promise<void>;
  markPaymentSubmitted(value: PaymentAttemptStatus): Promise<void>;
  getPaymentSubmission(preparedPaymentId: string): Promise<PaymentAttemptStatus | null>;
  deletePaymentAttempt(preparedPaymentId: string): Promise<void>;
  /**
   * Atomically marks an attempt terminal the first time and returns that time.
   * Returns null if it was already terminal, so only one caller reconciles it.
   */
  claimPaymentAttemptTerminal(
    preparedPaymentId: string,
    state: Exclude<PaymentAttemptState, "SUBMITTED">,
    now: number,
    rejection?: string | null,
  ): Promise<number | null>;
}

export interface MembershipAttemptRepository {
  saveMembershipAttempt(value: MembershipAttempt): Promise<void>;
  getMembershipAttempt(id: string, now: number): Promise<MembershipAttempt | null>;
  /** Reads an attempt by id for the reconciler, ignoring the client-facing TTL. */
  getMembershipAttemptForSettlement(id: string): Promise<MembershipAttempt | null>;
  pruneMembershipAttempts(now: number): Promise<void>;
  markMembershipSubmitted(value: MembershipAttemptStatus): Promise<void>;
  getMembershipSubmission(
    preparedMembershipId: string,
  ): Promise<MembershipAttemptStatus | null>;
  deleteMembershipAttempt(preparedMembershipId: string): Promise<void>;
  /**
   * Atomically marks an attempt terminal the first time and returns that time.
   * Returns null if it was already terminal, so only one caller reconciles it.
   */
  claimMembershipAttemptTerminal(
    preparedMembershipId: string,
    state: Exclude<MembershipAttemptState, "SUBMITTED">,
    now: number,
    rejection?: string | null,
  ): Promise<number | null>;
  /** Every unresolved (SUBMITTED) membership attempt, oldest first. */
  pendingMembershipAttempts(limit: number): Promise<MembershipAttemptStatus[]>;
  /** Every unresolved (SUBMITTED) payment attempt, oldest first. */
  pendingPaymentAttempts(limit: number): Promise<PaymentAttemptStatus[]>;
}

export interface ProfileRepository {
  getProfile(address: string): Promise<Profile | null>;
  saveProfile(value: Profile): Promise<void>;
  searchCreators(name: string, limit: number): Promise<Profile[]>;
  publicCreators(limit: number): Promise<Profile[]>;
}

export interface PostRepository {
  reservePublication(value: Post, expiresAt: number): Promise<"RESERVED" | "DUPLICATE">;
  commitPublication(value: Post): Promise<"COMMITTED" | "DUPLICATE">;
  releasePublication(postId: string): Promise<void>;
  prunePendingPublications(now: number): Promise<void>;
  publishPost(value: Post): Promise<"COMMITTED" | "MEDIA_DIGEST_CONFLICT">;
  getPost(id: string): Promise<Post | null>;
  findPostByMedia(creator: string, digest: string): Promise<Post | null>;
  creatorPosts(address: string): Promise<Post[]>;
  /** The newest post for each of the given creators, for directory listings. */
  latestPosts?(creators: string[]): Promise<Post[]>;
  deletePost(id: string): Promise<Post | null>;
}

export interface PurchaseRepository {
  createPurchase(value: Purchase): Promise<DuplicateOutcome>;
  getPurchase(postId: string, buyer: string): Promise<Purchase | null>;
  purchasesForBuyer(buyer: string): Promise<Purchase[]>;
  finalizePurchase(
    preparedPaymentId: string,
    value: Purchase,
  ): Promise<DuplicateOutcome>;
}

export interface CovenantRepository {
  getCreatorCovenant(creator: string): Promise<CreatorCovenant | null>;
  listCreatorCovenants?(creator: string): Promise<CreatorCovenant[]>;
  /** Active offers for many creators at once, for directory listings. */
  activeCovenants?(creators: string[]): Promise<CreatorCovenant[]>;
  saveCreatorCovenant(value: CreatorCovenant): Promise<DuplicateOutcome>;
  finalizeOffer(
    preparedMembershipId: string,
    value: CreatorCovenant,
  ): Promise<DuplicateOutcome>;
  finalizePriceUpdate(
    preparedMembershipId: string,
    value: CreatorCovenant,
  ): Promise<DuplicateOutcome>;
  finalizeCancellation?(
    preparedMembershipId: string,
    value: Pick<CreatorCovenant, "creator" | "covenantId">,
  ): Promise<DuplicateOutcome>;
}

export interface MembershipPurchaseRepository {
  createMembershipPurchase(value: MembershipPurchase): Promise<DuplicateOutcome>;
  membershipReceipts(buyer: string, creator: string): Promise<MembershipPurchase[]>;
  /** Every recorded membership for an address, across creators. */
  membershipReceiptsForBuyer(buyer: string): Promise<MembershipPurchase[]>;
  finalizeMembershipPurchase(
    preparedMembershipId: string,
    value: MembershipPurchase,
  ): Promise<DuplicateOutcome>;
}

export interface Repositories
  extends
    ChallengeRepository,
    SessionRepository,
    PaymentAttemptRepository,
    MembershipAttemptRepository,
    ProfileRepository,
    PostRepository,
    PurchaseRepository,
    CovenantRepository,
    MembershipPurchaseRepository,
    TransactionEvidenceStore {
  initialize(): Promise<void>;
}

/**
 * Stores the signed transactions we submit, so later reads can verify from
 * evidence instead of depending on a node's transaction index.
 */
export interface TransactionEvidenceStore {
  saveTransactionEvidence(value: TransactionEvidence): Promise<void>;
  getTransactionEvidence(transactionId: string): Promise<TransactionEvidence | null>;
}

export interface PaymentGateway {
  prepare(
    post: Post,
    buyer: string,
    referrer?: string | null,
  ): Promise<PreparedPayment>;
  submit(
    prepared: PreparedPayment,
    signedTransaction: string,
  ): Promise<PaymentSubmission>;
  status(transactionId: string): Promise<PaymentSubmission>;
  verifyPurchase(
    transactionId: string,
    buyer: string,
    creator: string,
    amountSompi: string,
    postId: string,
    mediaDigest: string,
  ): Promise<boolean>;
}

/**
 * The covenant moved on chain while the caller was working (a competing spend
 * or a retry of the same action landed first). It is not a fault: another
 * submission against the refreshed state can succeed.
 */
export class MembershipStateChangedError extends Error {
  constructor() {
    super("MEMBERSHIP_STATE_CHANGED");
    this.name = "MembershipStateChangedError";
  }
}

/**
 * The network refused to take a signed transaction: an upstream node fault, not
 * a mistake the caller made and not a state change. Nothing was charged, so the
 * only honest thing to say is that it went wrong and can be tried again.
 */
export class MembershipSubmissionError extends Error {
  constructor() {
    super("MEMBERSHIP_SUBMISSION_FAILED");
    this.name = "MembershipSubmissionError";
  }
}

/**
 * The node refused the transaction because an input it spends - the covenant
 * output of a fresh offer - has not finalized yet. The chain is mid-flight, not
 * the caller's mistake and not an upstream fault: the same subscription is
 * accepted once the output settles. Named, so the boundary can report a retry
 * instead of a server failure.
 */
export class MembershipNotFinalizedError extends Error {
  constructor() {
    super("MEMBERSHIP_NOT_FINALIZED");
    this.name = "MembershipNotFinalizedError";
  }
}

export interface MembershipGateway {
  prepareOffer(
    creator: string,
    priceSompi: string,
  ): Promise<PreparedMembershipTransaction>;
  prepareMint(
    creator: string,
    buyer: string,
    covenantId: string,
    priceSompi: string,
    contract: MembershipContract,
  ): Promise<PreparedMembershipTransaction>;
  preparePriceUpdate(
    creator: string,
    covenantId: string,
    currentPriceSompi: string,
    newPriceSompi: string,
    contract: MembershipContract,
  ): Promise<PreparedMembershipTransaction>;
  prepareCancellation(
    creator: string,
    covenantId: string,
    priceSompi: string,
    contract: MembershipContract,
  ): Promise<PreparedMembershipTransaction>;
  /**
   * Put the signed transaction on the network. Transport only: it reports
   * whether the node took it (a transaction id) or refused it, and nothing
   * about whether it has taken effect on the ledger.
   */
  submit(
    prepared: PreparedMembershipTransaction,
    signedTransaction: string,
  ): Promise<MembershipSubmission>;
  /**
   * Whether the prepared transaction's covenant output has taken effect on the
   * ledger — the fact a reader pays into. Callers that must report "confirmed"
   * ask this after submit; a purchase settles by its member output instead.
   */
  confirm(
    prepared: PreparedMembershipTransaction,
    transactionId: string,
  ): Promise<boolean>;
  /**
   * Whether the creator's offer can currently be served: its covenant output
   * is on chain and the transaction that created it is readable. A stored
   * covenant alone does not mean the subscription is live.
   */
  offerAvailable?(
    creator: string,
    covenantId: string,
    priceSompi: string,
    contract: MembershipContract,
  ): Promise<boolean>;
  /**
   * Reports whether the chain has accepted a previously submitted transaction.
   * Used by the reconciler to finish workflows whose client disappeared.
   */
  status?(transactionId: string): Promise<PaymentSubmission>;
}

export interface ObjectStorage {
  putFile(key: string, sourcePath: string, contentType: string): Promise<void>;
  readRange(
    key: string,
    start?: number,
    end?: number,
  ): Promise<{ bytes: Uint8Array; size: number; contentType: string }>;
  streamRange?: (
    key: string,
    start?: number,
    end?: number,
  ) => Promise<{
    body: AsyncIterable<Uint8Array>;
    size: number;
    contentType: string;
  }>;
  delete(key: string): Promise<void>;
}

export interface WalletVerifier {
  verify(
    message: string,
    signature: string,
    publicKey: string,
    address: string,
  ): Promise<boolean>;
}

export interface MembershipVerifier {
  verifyUtxo(
    transactionId: string,
    outputIndex: number,
    expectedOwner?: string,
    expectedCovenantId?: string,
    expectedCreator?: string,
    contract?: MembershipContract,
  ): Promise<MembershipCheck>;
}

export type {
  PaymentSubmission,
  MembershipSubmission,
  PreparedMembershipTransaction,
};
