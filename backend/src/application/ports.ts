import type {
  Challenge,
  CreatorCovenant,
  MembershipCheck,
  MembershipPurchase,
  Post,
  PreparedMembershipRecord,
  PreparedMembershipTransaction,
  MembershipWorkflow,
  MembershipWorkflowState,
  PreparedPaymentRecord,
  PreparedPayment,
  PaymentSubmission,
  PaymentWorkflow,
  PaymentWorkflowState,
  Profile,
  Purchase,
  Session,
  TransactionEvidence,
  IdempotencyRecord,
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

export interface PreparedPaymentRepository {
  savePreparedPayment(value: PreparedPaymentRecord): Promise<void>;
  getPreparedPayment(id: string, now: number): Promise<PreparedPaymentRecord | null>;
  deletePreparedPayment(id: string): Promise<void>;
  prunePreparedPayments(now: number): Promise<void>;
  savePaymentWorkflow(value: PaymentWorkflow): Promise<void>;
  getPaymentWorkflow(preparedPaymentId: string): Promise<PaymentWorkflow | null>;
  deletePaymentWorkflow(preparedPaymentId: string): Promise<void>;
  /**
   * Atomically marks a workflow terminal the first time and returns that time.
   * Returns null if it was already terminal, so only one caller reconciles it.
   */
  claimPaymentWorkflowTerminal(
    preparedPaymentId: string,
    state: Exclude<PaymentWorkflowState, "SUBMITTED">,
    now: number,
    rejection?: string | null,
  ): Promise<number | null>;
}

export interface PreparedMembershipRepository {
  savePreparedMembership(value: PreparedMembershipRecord): Promise<void>;
  getPreparedMembership(
    id: string,
    now: number,
  ): Promise<PreparedMembershipRecord | null>;
  deletePreparedMembership(id: string): Promise<void>;
  prunePreparedMemberships(now: number): Promise<void>;
  saveMembershipWorkflow(value: MembershipWorkflow): Promise<void>;
  getMembershipWorkflow(
    preparedMembershipId: string,
  ): Promise<MembershipWorkflow | null>;
  deleteMembershipWorkflow(preparedMembershipId: string): Promise<void>;
  /**
   * Atomically marks a workflow terminal the first time and returns that time.
   * Returns null if it was already terminal, so only one caller reconciles it.
   */
  claimMembershipWorkflowTerminal(
    preparedMembershipId: string,
    state: Exclude<MembershipWorkflowState, "SUBMITTED">,
    now: number,
    rejection?: string | null,
  ): Promise<number | null>;
  /** Every unresolved (SUBMITTED) membership workflow, oldest first. */
  pendingMembershipWorkflows(limit: number): Promise<MembershipWorkflow[]>;
  /** Every unresolved (SUBMITTED) payment workflow, oldest first. */
  pendingPaymentWorkflows(limit: number): Promise<PaymentWorkflow[]>;
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
  finalizeMembershipPurchase(
    preparedMembershipId: string,
    value: MembershipPurchase,
  ): Promise<DuplicateOutcome>;
}

export interface Repositories
  extends
    ChallengeRepository,
    SessionRepository,
    PreparedPaymentRepository,
    PreparedMembershipRepository,
    ProfileRepository,
    PostRepository,
    PurchaseRepository,
    CovenantRepository,
    MembershipPurchaseRepository,
    TransactionEvidenceStore,
    IdempotencyStore {
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

/** Stores write responses keyed by a caller-supplied idempotency key. */
export interface IdempotencyStore {
  saveIdempotency(value: IdempotencyRecord): Promise<void>;
  getIdempotency(
    key: string,
    method: string,
    path: string,
  ): Promise<IdempotencyRecord | null>;
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
  ): Promise<PreparedMembershipTransaction>;
  preparePriceUpdate(
    creator: string,
    covenantId: string,
    currentPriceSompi: string,
    newPriceSompi: string,
  ): Promise<PreparedMembershipTransaction>;
  prepareCancellation(
    creator: string,
    covenantId: string,
    priceSompi: string,
  ): Promise<PreparedMembershipTransaction>;
  submit(
    prepared: PreparedMembershipTransaction,
    signedTransaction: string,
  ): Promise<PaymentSubmission>;
  /**
   * Whether the creator's offer can currently be served: its covenant output
   * is on chain and the transaction that created it is readable. A stored
   * covenant alone does not mean the subscription is live.
   */
  offerAvailable?(
    creator: string,
    covenantId: string,
    priceSompi: string,
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
  verifyAddress(
    address: string,
    expectedOwner?: string,
    expectedCovenantId?: string,
    expectedCreator?: string,
  ): Promise<MembershipCheck[]>;
  findMembership(
    owner: string,
    creator: string,
    expectedCovenantId?: string,
  ): Promise<MembershipCheck | null>;
  verifyUtxo(
    transactionId: string,
    outputIndex: number,
    expectedOwner?: string,
    expectedCovenantId?: string,
    expectedCreator?: string,
  ): Promise<MembershipCheck>;
}

export type { PaymentSubmission, PreparedMembershipTransaction };
