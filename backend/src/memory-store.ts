import type {
  Challenge,
  CreatorCovenant,
  MembershipPurchase,
  Post,
  MembershipAttempt,
  PaymentAttempt,
  PaymentAttemptStatus,
  PaymentAttemptState,
  MembershipAttemptStatus,
  MembershipAttemptState,
  Profile,
  Purchase,
  Session,
  TransactionEvidence,
} from "./domain/models.js";
import type { DuplicateOutcome, Repositories } from "./application/ports.js";

/**
 * One payment attempt, from the template handed to the client through the
 * transaction broadcast and on to settlement. The template and the submission
 * are the same row; its lifetime is its own.
 */
type PaymentAttemptRow = PaymentAttempt & {
  state: PaymentAttemptState;
  transactionId: string | null;
  rejection: string | null;
  submittedAt: number | null;
};
type MembershipAttemptRow = MembershipAttempt & {
  state: MembershipAttemptState;
  transactionId: string | null;
  rejection: string | null;
  submittedAt: number | null;
};

export class MemoryStore implements Repositories {
  readonly challenges = new Map<string, Challenge>();
  readonly sessions = new Map<string, Session>();
  readonly profiles = new Map<string, Profile>();
  readonly posts = new Map<string, Post>();
  readonly pendingPosts = new Map<string, { post: Post; expiresAt: number }>();
  readonly purchases = new Map<string, Purchase>();
  /** Every covenant, keyed by covenant id; at most one is ACTIVE per creator. */
  readonly covenants = new Map<string, CreatorCovenant>();
  readonly membershipPurchaseRecords = new Map<string, MembershipPurchase>();
  readonly paymentAttemptRecords = new Map<string, PaymentAttemptRow>();
  readonly membershipAttemptRecords = new Map<string, MembershipAttemptRow>();
  readonly transactionEvidence = new Map<string, TransactionEvidence>();
  async initialize() {}
  async saveTransactionEvidence(v: TransactionEvidence) {
    if (!this.transactionEvidence.has(v.transactionId))
      this.transactionEvidence.set(v.transactionId, structuredClone(v));
  }
  async getTransactionEvidence(transactionId: string) {
    const v = this.transactionEvidence.get(transactionId);
    return v ? structuredClone(v) : null;
  }
  async createChallenge(v: Challenge) {
    this.challenges.set(v.id, structuredClone(v));
  }
  async consumeChallenge(id: string, now: number) {
    const v = this.challenges.get(id);
    if (!v || v.consumedAt !== null || v.expiresAt <= now) return null;
    v.consumedAt = now;
    return structuredClone(v);
  }
  async pruneChallenges(now: number) {
    for (const [id, v] of this.challenges)
      if (v.consumedAt !== null || v.expiresAt <= now) this.challenges.delete(id);
  }
  async savePaymentAttempt(v: PaymentAttempt) {
    this.paymentAttemptRecords.set(
      v.id,
      structuredClone({
        ...v,
        state: "PREPARED" as const,
        transactionId: null,
        rejection: null,
        submittedAt: null,
      }),
    );
  }
  async getPaymentAttempt(id: string, now: number) {
    const v = this.paymentAttemptRecords.get(id);
    return v && v.expiresAt > now ? paymentRecord(v) : null;
  }
  async getPaymentAttemptForSettlement(id: string) {
    const v = this.paymentAttemptRecords.get(id);
    return v ? paymentRecord(v) : null;
  }
  async prunePaymentAttempts(now: number) {
    // Only an attempt that was never submitted may be pruned by age; a
    // submitted one is owned by the reconciler until it is settled.
    for (const [id, v] of this.paymentAttemptRecords)
      if (v.expiresAt <= now && v.state === "PREPARED")
        this.paymentAttemptRecords.delete(id);
  }
  async markPaymentSubmitted(v: PaymentAttemptStatus) {
    const attempt = this.paymentAttemptRecords.get(v.preparedPaymentId);
    if (!attempt) return;
    attempt.state = v.state;
    attempt.transactionId = v.transactionId;
    attempt.rejection = v.rejection;
    attempt.submittedAt = attempt.submittedAt ?? v.submittedAt ?? Date.now();
  }
  async getPaymentSubmission(id: string): Promise<PaymentAttemptStatus | null> {
    const v = this.paymentAttemptRecords.get(id);
    if (!v || v.state === "PREPARED") return null;
    return {
      preparedPaymentId: id,
      state: v.state,
      transactionId: v.transactionId ?? "",
      rejection: v.rejection,
      submittedAt: v.submittedAt,
    };
  }
  async deletePaymentAttempt(id: string) {
    return this.paymentAttemptRecords.delete(id);
  }
  async pendingPaymentAttempts(limit: number): Promise<PaymentAttemptStatus[]> {
    return [...this.paymentAttemptRecords.values()]
      .filter(
        (v): v is PaymentAttemptRow & { state: "SUBMITTED" } => v.state === "SUBMITTED",
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, limit)
      .map((v) => ({
        preparedPaymentId: v.id,
        state: v.state,
        transactionId: v.transactionId ?? "",
        rejection: v.rejection,
        submittedAt: v.submittedAt,
      }));
  }
  async markMembershipSubmitted(v: MembershipAttemptStatus) {
    const attempt = this.membershipAttemptRecords.get(v.preparedMembershipId);
    if (!attempt) return;
    attempt.state = v.state;
    attempt.transactionId = v.transactionId;
    attempt.rejection = v.rejection;
    attempt.submittedAt = attempt.submittedAt ?? v.submittedAt ?? Date.now();
  }
  async getMembershipSubmission(id: string): Promise<MembershipAttemptStatus | null> {
    const v = this.membershipAttemptRecords.get(id);
    if (!v || v.state === "PREPARED") return null;
    return {
      preparedMembershipId: id,
      state: v.state,
      transactionId: v.transactionId ?? "",
      rejection: v.rejection,
      submittedAt: v.submittedAt,
    };
  }
  async deleteMembershipAttempt(id: string) {
    return this.membershipAttemptRecords.delete(id);
  }
  async pendingMembershipAttempts(limit: number): Promise<MembershipAttemptStatus[]> {
    return [...this.membershipAttemptRecords.values()]
      .filter(
        (v): v is MembershipAttemptRow & { state: "SUBMITTED" } =>
          v.state === "SUBMITTED",
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, limit)
      .map((v) => ({
        preparedMembershipId: v.id,
        state: v.state,
        transactionId: v.transactionId ?? "",
        rejection: v.rejection,
        submittedAt: v.submittedAt,
      }));
  }
  async saveMembershipAttempt(v: MembershipAttempt) {
    this.membershipAttemptRecords.set(
      v.id,
      structuredClone({
        ...v,
        state: "PREPARED" as const,
        transactionId: null,
        rejection: null,
        submittedAt: null,
      }),
    );
  }
  async getMembershipAttempt(id: string, now: number) {
    const v = this.membershipAttemptRecords.get(id);
    return v && v.expiresAt > now ? membershipRecord(v) : null;
  }
  async getMembershipAttemptForSettlement(id: string) {
    const v = this.membershipAttemptRecords.get(id);
    return v ? membershipRecord(v) : null;
  }
  async pruneMembershipAttempts(now: number) {
    // Only an attempt that was never submitted may be pruned by age; a
    // submitted one is owned by the reconciler until it is settled.
    for (const [id, v] of this.membershipAttemptRecords)
      if (v.expiresAt <= now && v.state === "PREPARED")
        this.membershipAttemptRecords.delete(id);
  }
  async createSession(v: Session) {
    this.sessions.set(v.id, structuredClone(v));
  }
  async getSession(id: string, now: number) {
    const v = this.sessions.get(id);
    return v && v.expiresAt > now ? structuredClone(v) : null;
  }
  async rollSession(id: string, expiresAt: number) {
    const v = this.sessions.get(id);
    if (v) v.expiresAt = expiresAt;
  }
  async deleteSession(id: string) {
    this.sessions.delete(id);
  }
  async pruneSessions(now: number) {
    for (const [id, v] of this.sessions)
      if (v.expiresAt <= now) this.sessions.delete(id);
  }
  async getProfile(address: string) {
    const v = this.profiles.get(address);
    return v ? structuredClone(v) : null;
  }
  async saveProfile(v: Profile) {
    this.profiles.set(v.address, structuredClone(v));
  }
  async searchCreators(name: string, limit: number) {
    const q = name.toLocaleLowerCase();
    return [...this.profiles.values()]
      .filter((v) => v.displayName?.toLocaleLowerCase().includes(q))
      .filter((v) => [...this.posts.values()].some((p) => p.creator === v.address))
      .slice(0, limit)
      .map((v) => structuredClone(v));
  }
  async publicCreators(limit: number) {
    const lastPost = new Map<string, number>();
    for (const post of this.posts.values()) {
      const current = lastPost.get(post.creator) ?? 0;
      if (post.publishedAt > current) lastPost.set(post.creator, post.publishedAt);
    }
    return [...lastPost.keys()]
      .map((address): Profile | null => {
        const profile = this.profiles.get(address);
        if (profile && !profile.isPublic) return null;
        return profile
          ? structuredClone(profile)
          : {
              address,
              displayName: null,
              bio: null,
              avatarKey: null,
              avatarType: null,
              isPublic: true,
              updatedAt: 0,
            };
      })
      .filter((v): v is Profile => v !== null)
      .sort((a, b) => {
        const at = lastPost.get(a.address) ?? 0;
        const bt = lastPost.get(b.address) ?? 0;
        if (at !== bt) return bt - at;
        return (a.displayName ?? a.address).localeCompare(b.displayName ?? b.address);
      })
      .slice(0, limit);
  }
  async publishPost(v: Post) {
    if (
      [...this.posts.values()].some(
        (p) => p.creator === v.creator && p.mediaDigest === v.mediaDigest,
      )
    )
      return "MEDIA_DIGEST_CONFLICT" as const;
    this.posts.set(v.id, structuredClone(v));
    return "COMMITTED" as const;
  }
  async reservePublication(v: Post, expiresAt: number) {
    if (
      [
        ...this.posts.values(),
        ...[...this.pendingPosts.values()].map((x) => x.post),
      ].some((post) => post.creator === v.creator && post.mediaDigest === v.mediaDigest)
    )
      return "DUPLICATE" as const;
    this.pendingPosts.set(v.id, { post: structuredClone(v), expiresAt });
    return "RESERVED" as const;
  }
  async commitPublication(v: Post) {
    const pending = this.pendingPosts.get(v.id);
    if (!pending || pending.post.mediaDigest !== v.mediaDigest) {
      this.pendingPosts.delete(v.id);
      return "DUPLICATE" as const;
    }
    this.pendingPosts.delete(v.id);
    this.posts.set(v.id, structuredClone(v));
    return "COMMITTED" as const;
  }
  async releasePublication(postId: string) {
    this.pendingPosts.delete(postId);
  }
  async prunePendingPublications(now: number) {
    for (const [id, pending] of this.pendingPosts)
      if (pending.expiresAt <= now) this.pendingPosts.delete(id);
  }
  async getPost(id: string) {
    const v = this.posts.get(id);
    return v ? structuredClone(v) : null;
  }
  async findPostByMedia(creator: string, digest: string) {
    const v = [...this.posts.values()].find(
      (p) => p.creator === creator && p.mediaDigest === digest,
    );
    return v ? structuredClone(v) : null;
  }
  async creatorPosts(address: string) {
    return [...this.posts.values()]
      .filter((v) => v.creator === address)
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .map((v) => structuredClone(v));
  }
  async latestPosts(creators: string[]) {
    const wanted = new Set(creators);
    const latest = new Map<string, Post>();
    for (const post of this.posts.values()) {
      if (!wanted.has(post.creator)) continue;
      const current = latest.get(post.creator);
      if (!current || post.publishedAt > current.publishedAt)
        latest.set(post.creator, post);
    }
    return [...latest.values()].map((v) => structuredClone(v));
  }
  async deletePost(id: string) {
    const v = this.posts.get(id);
    if (!v) return null;
    this.posts.delete(id);
    for (const [key, value] of this.purchases)
      if (value.postId === id) this.purchases.delete(key);
    return structuredClone(v);
  }
  async createPurchase(v: Purchase): Promise<DuplicateOutcome> {
    const duplicate = [...this.purchases.values()].some(
      (x) => x.transactionId === v.transactionId,
    );
    if (duplicate || this.purchases.has(`${v.postId}:${v.buyer}`)) return "DUPLICATE";
    this.purchases.set(`${v.postId}:${v.buyer}`, structuredClone(v));
    return "CREATED";
  }
  async getPurchase(postId: string, buyer: string) {
    const v = this.purchases.get(`${postId}:${buyer}`);
    return v ? structuredClone(v) : null;
  }
  async purchasesForBuyer(buyer: string) {
    return [...this.purchases.values()]
      .filter((v) => v.buyer === buyer)
      .map((v) => structuredClone(v));
  }
  async getCreatorCovenant(creator: string) {
    const active = this.activeFor(creator);
    return active ? this.present(active) : null;
  }
  async getCovenant(covenantId: string) {
    const value = this.covenants.get(covenantId);
    return value ? this.present(value) : null;
  }
  async listCreatorCovenants(creator: string) {
    return [...this.covenants.values()]
      .filter((v) => v.creator === creator)
      .map((v) => this.present(v));
  }
  async activeCovenants(creators: string[]) {
    const wanted = new Set(creators);
    return [...this.covenants.values()]
      .filter((v) => wanted.has(v.creator) && isActiveCovenant(v))
      .map((v) => this.present(v));
  }
  /** Mirrors the stored-row shape: status appears only when canceled. */
  private present(value: CreatorCovenant): CreatorCovenant {
    return {
      creator: value.creator,
      covenantId: value.covenantId,
      priceSompi: value.priceSompi,
      ...(value.status === "CANCELED" ? { status: "CANCELED" as const } : {}),
      ...(value.contract ? { contract: value.contract } : {}),
    };
  }
  async saveCreatorCovenant(v: CreatorCovenant): Promise<DuplicateOutcome> {
    if (this.activeFor(v.creator) || this.covenants.has(v.covenantId))
      return "DUPLICATE";
    this.covenants.set(v.covenantId, { ...v, status: "ACTIVE" });
    return "CREATED";
  }
  private activeFor(creator: string): CreatorCovenant | undefined {
    return [...this.covenants.values()].find(
      (v) => v.creator === creator && isActiveCovenant(v),
    );
  }
  async createMembershipPurchase(v: MembershipPurchase): Promise<DuplicateOutcome> {
    if (this.membershipPurchaseRecords.has(v.transactionId)) return "DUPLICATE";
    this.membershipPurchaseRecords.set(v.transactionId, structuredClone(v));
    return "CREATED";
  }
  async membershipReceipts(buyer: string, creator: string) {
    return [...this.membershipPurchaseRecords.values()]
      .filter((v) => v.buyer === buyer && v.creator === creator)
      .map((v) => structuredClone(v));
  }
  async membershipReceiptsForBuyer(buyer: string) {
    return [...this.membershipPurchaseRecords.values()]
      .filter((v) => v.buyer === buyer)
      .map((v) => structuredClone(v));
  }
  async finalizePurchase(id: string, value: Purchase): Promise<DuplicateOutcome> {
    const outcome = await this.createPurchase(value);
    this.paymentAttemptRecords.delete(id);
    return outcome;
  }
  async finalizeOffer(id: string, value: CreatorCovenant): Promise<DuplicateOutcome> {
    const outcome = await this.saveCreatorCovenant(value);
    this.membershipAttemptRecords.delete(id);
    return outcome;
  }
  async finalizePriceUpdate(
    id: string,
    value: CreatorCovenant,
  ): Promise<DuplicateOutcome> {
    const active = this.activeByCovenant(value.creator, value.covenantId);
    if (!active) {
      this.membershipAttemptRecords.delete(id);
      return "DUPLICATE";
    }
    this.covenants.set(value.covenantId, { ...value, status: "ACTIVE" });
    this.membershipAttemptRecords.delete(id);
    return "CREATED";
  }
  async finalizeCancellation(
    id: string,
    value: Pick<CreatorCovenant, "creator" | "covenantId">,
  ): Promise<DuplicateOutcome> {
    const active = this.activeByCovenant(value.creator, value.covenantId);
    if (!active) {
      this.membershipAttemptRecords.delete(id);
      return "DUPLICATE";
    }
    this.covenants.set(value.covenantId, { ...active, status: "CANCELED" });
    this.membershipAttemptRecords.delete(id);
    return "CREATED";
  }
  private activeByCovenant(
    creator: string,
    covenantId: string,
  ): CreatorCovenant | undefined {
    const value = this.covenants.get(covenantId);
    return value && value.creator === creator && isActiveCovenant(value)
      ? value
      : undefined;
  }
  async finalizeMembershipPurchase(
    id: string,
    value: MembershipPurchase,
  ): Promise<DuplicateOutcome> {
    const outcome = await this.createMembershipPurchase(value);
    this.membershipAttemptRecords.delete(id);
    return outcome;
  }
}

/** A covenant offering access; a canceled one no longer counts as current. */
const isActiveCovenant = (value: CreatorCovenant) => value.status !== "CANCELED";

/** The client-facing shape of an attempt, without its submission state. */
const paymentRecord = (v: PaymentAttemptRow): PaymentAttempt =>
  structuredClone({
    id: v.id,
    transaction: v.transaction,
    fingerprint: v.fingerprint,
    amountSompi: v.amountSompi,
    creator: v.creator,
    postId: v.postId,
    buyer: v.buyer,
    expiresAt: v.expiresAt,
  });
const membershipRecord = (v: MembershipAttemptRow): MembershipAttempt =>
  structuredClone({
    id: v.id,
    transaction: v.transaction,
    fingerprint: v.fingerprint,
    covenantId: v.covenantId,
    signInputs: v.signInputs,
    memberOutputIndex: v.memberOutputIndex,
    creator: v.creator,
    buyer: v.buyer,
    kind: v.kind,
    expiresAt: v.expiresAt,
    priceSompi: v.priceSompi,
    ...(v.contract ? { contract: v.contract } : {}),
  });
