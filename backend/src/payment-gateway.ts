import { createHash } from "node:crypto";
import { addressFromScriptPublicKey } from "@kluster/kaspa-wasm";
import { DEFAULT_NETWORK, networkDefinition, type NetworkId } from "@kaskama/shared";
import type { Post, PreparedPayment, PaymentSubmission } from "./domain/models.js";
import type { PaymentGateway, TransactionEvidenceStore } from "./application/ports.js";
import { logger as defaultLogger, type Logger } from "./observability.js";
import { defaultMetrics, type Metrics } from "./metrics.js";
import { paymentSplit, type PaymentSplit } from "./payment-fee.js";
import { parsePpvPayload, ppvPayload } from "./ppv-payload.js";
import { submitMembershipTransactionOverWrpc } from "./membership-gateway.js";

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const ZERO_SUBNETWORK = "0".repeat(40);
const VERIFY_MAX_ATTEMPTS = 5;
const VERIFY_BASE_DELAY_MS = 1_000;
const VERIFY_MAX_DELAY_MS = 4_000;
const CHANGE_DUST_SOMPI = 2_200_000n;
type Sleep = (milliseconds: number) => Promise<void>;
type PaymentTransactionRelay = (signedTransaction: string) => Promise<string>;
type Utxo = { outpoint: { transactionId: string; index: number }; utxoEntry: { amount: string; scriptPublicKey: { scriptPublicKey: string }; blockDaaScore: string; isCoinbase: boolean } };
type ChainTransaction = { is_accepted?: boolean; payload?: string; inputs?: { previous_outpoint_resolved?: { script_public_key_address?: string } }[]; outputs?: { amount?: string | number; script_public_key_address?: string }[] };

export class KaspaPaymentGateway implements PaymentGateway {
  private readonly relay: PaymentTransactionRelay;
  constructor(
    private readonly platformFeeAddress: string,
    private readonly api = networkDefinition(DEFAULT_NETWORK).defaultNodeUrl,
    private readonly sleep: Sleep = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
    private readonly logger: Logger = defaultLogger,
    private readonly metrics: Metrics = defaultMetrics,
    relay?: PaymentTransactionRelay,
    private readonly network: NetworkId = DEFAULT_NETWORK,
    private readonly evidence?: TransactionEvidenceStore,
  ) {
    this.relay =
      relay ??
      ((signedTransaction) =>
        submitMembershipTransactionOverWrpc(
          signedTransaction,
          undefined,
          this.network,
        ));
  }

  async prepare(
    post: Post,
    buyer: string,
    referrer?: string | null,
  ): Promise<PreparedPayment> {
    const [utxos, estimate] = await Promise.all([
      this.request<Utxo[]>("utxos", `/addresses/${encodeURIComponent(buyer)}/utxos`),
      this.request<{ normalBuckets: { feerate: number }[]; priorityBucket: { feerate: number } }>("fee_estimate", "/info/fee-estimate"),
    ]);
    const amount = BigInt(post.priceSompi);
    const creditedReferrer = this.creditableReferrer(referrer);
    const split = paymentSplit(amount, creditedReferrer !== null);
    // The change output is the last one and only exists when it clears dust.
    const outputCount =
      1 + (split.referrer > 0n ? 1 : 0) + (split.platform > 0n ? 1 : 0) + 1;
    const payload = ppvPayload(post.id, post.mediaDigest, split.referrer > 0n ? creditedReferrer : null);
    const rate = estimate.normalBuckets[0]?.feerate ?? estimate.priorityBucket.feerate;
    const buyerScript = scriptFor(buyer);
    const selected: Utxo[] = [];
    let total = 0n;
    for (const utxo of [...utxos].sort((a, b) => Number(BigInt(a.utxoEntry.amount) - BigInt(b.utxoEntry.amount)))) {
      if (`0000${utxo.utxoEntry.scriptPublicKey.scriptPublicKey}` !== buyerScript) continue;
      selected.push(utxo);
      total += BigInt(utxo.utxoEntry.amount);
      if (total >= amount + estimatedFee(selected, rate, outputCount, payload)) break;
    }
    const networkFee = estimatedFee(selected, rate, outputCount, payload);
    if (total < amount + networkFee) {
      this.logger.warn("payment_prepare_insufficient_funds", {
        postId: post.id,
        amountSompi: post.priceSompi,
      });
      throw new Error("INSUFFICIENT_FUNDS");
    }
    const outputs = [
      { value: split.creator.toString(), scriptPublicKey: scriptFor(post.creator), covenant: null },
    ];
    if (split.referrer > 0n && creditedReferrer !== null)
      outputs.push({ value: split.referrer.toString(), scriptPublicKey: scriptFor(creditedReferrer), covenant: null });
    if (split.platform > 0n) outputs.push({ value: split.platform.toString(), scriptPublicKey: scriptFor(this.platformFeeAddress), covenant: null });
    const change = total - amount - networkFee;
    if (change >= CHANGE_DUST_SOMPI) outputs.push({ value: change.toString(), scriptPublicKey: buyerScript, covenant: null });
    const transaction = JSON.stringify({ id: "0".repeat(64), version: 0, inputs: selected.map((utxo) => ({ transactionId: utxo.outpoint.transactionId, index: utxo.outpoint.index, sequence: "0", sigOpCount: 1, computeBudget: 0, signatureScript: "", utxo: { amount: utxo.utxoEntry.amount, scriptPublicKey: `0000${utxo.utxoEntry.scriptPublicKey.scriptPublicKey}`, blockDaaScore: utxo.utxoEntry.blockDaaScore, isCoinbase: utxo.utxoEntry.isCoinbase } })), outputs, subnetworkId: ZERO_SUBNETWORK, lockTime: "0", gas: "0", storageMass: "20000", payload });
    this.logger.debug("payment_prepared", {
      postId: post.id,
      inputCount: selected.length,
      outputCount: outputs.length,
      amountSompi: post.priceSompi,
      referred: split.referrer > 0n,
    });
    return { transaction, fingerprint: digest(transaction), amountSompi: post.priceSompi, creator: post.creator };
  }

  /**
   * A referrer is only credited when it can actually receive a payout: a valid
   * address on this network whose script encodes as a single-key P2PK output.
   * Anything else is dropped without failing the purchase, so a bad share link
   * can never block a sale.
   */
  private creditableReferrer(referrer: string | null | undefined): string | null {
    if (!referrer) return null;
    if (!networkDefinition(this.network).addressPattern.test(referrer)) return null;
    try {
      const script = scriptFor(referrer);
      // scriptFor drops the checksum, so only a canonical round-trip proves
      // the address we would store is the one the payout script actually pays.
      // A checksum typo decodes to a different address and is dropped here.
      return this.addressOf(script) === referrer ? referrer : null;
    } catch {
      return null;
    }
  }

  async submit(prepared: PreparedPayment, signedTransaction: string): Promise<PaymentSubmission> {
    let signed: Record<string, unknown>;
    try { signed = JSON.parse(signedTransaction) as Record<string, unknown>; } catch { return this.reject("INVALID_TRANSACTION"); }
    const original = JSON.parse(prepared.transaction) as Record<string, unknown>;
    if (!isTransactionShape(original) || !isTransactionShape(signed)) return this.reject("INVALID_TRANSACTION");
    if (digest(prepared.transaction) !== prepared.fingerprint) return this.reject("INVALID_PREPARED_TEMPLATE");
    if (!sameTransaction(original, signed)) return this.reject("PREPARED_TRANSACTION_CHANGED");
    if (!hasAllSignatures(signed)) return this.reject("INVALID_SIGNATURES");
    let transactionId: string;
    try {
      transactionId = await this.relay(signedTransaction);
    } catch (error) {
      return this.reject(error instanceof Error ? error.message : "TRANSACTION_REJECTED");
    }
    this.logger.info("payment_submitted", { transactionIdPrefix: transactionId.slice(0, 12) });
    // Capture the signed transaction now, while we have it, so later reads can
    // verify the purchase from evidence instead of re-fetching from a node.
    if (this.evidence)
      await this.evidence.saveTransactionEvidence({
        transactionId,
        transaction: signedTransaction,
        acceptedAt: Date.now(),
      });
    // Confirm by the transaction's effect on the ledger, not by asking the node
    // for the transaction id: a node's transaction index is an implementation
    // detail the payment rules must not depend on.
    const accepted = await this.confirmByEffect(prepared.transaction, transactionId);
    return accepted
      ? { isAccepted: true, transactionId, rejection: null }
      : { isAccepted: null, transactionId, rejection: null };
  }

  private reject(reason: string, transactionId: string | null = null): PaymentSubmission {
    this.logger.warn("payment_submit_rejected", {
      reason,
      ...(transactionId ? { transactionIdPrefix: transactionId.slice(0, 12) } : {}),
    });
    return rejected(reason, transactionId);
  }

  async status(transactionId: string): Promise<PaymentSubmission> {
    const value = await this.requestRetryingMissing<{ is_accepted: boolean }>("transaction_status", `/transactions/${transactionId}`);
    return { isAccepted: value?.is_accepted ? true : null, transactionId, rejection: null };
  }

  async verifyPurchase(transactionId: string, buyer: string, creator: string, amountSompi: string, postId: string, mediaDigest: string): Promise<boolean> {
    // Prefer the evidence captured at submit: it is the transaction we built and
    // validated, and it does not depend on any node's transaction index.
    const evidence = await this.evidence?.getTransactionEvidence(transactionId);
    if (evidence)
      return this.verifyEvidence(evidence.transaction, buyer, creator, amountSompi, postId, mediaDigest);
    const tx = await this.requestRetryingMissing<ChainTransaction>(
      "verify_purchase",
      `/transactions/${transactionId}?inputs=true&outputs=true&resolve_previous_outpoints=full`,
    );
    if (!tx) return false;
    if (!tx.is_accepted || !tx.inputs?.length || !tx.outputs?.length) return false;
    const payload = parsePpvPayload(tx.payload);
    if (tx.payload && (!payload || payload.postId !== postId || payload.mediaHash.digest !== mediaDigest.toLowerCase())) return false;
    if (!tx.inputs.every((input) => input.previous_outpoint_resolved?.script_public_key_address === buyer)) return false;
    const amount = BigInt(amountSompi);
    const referrer = payload?.referrer ?? null;
    return outputsPayCreatorAndPlatform(
      (tx.outputs ?? []).map((output) => ({ value: String(output.amount), address: output.script_public_key_address })),
      paymentSplit(amount, referrer !== null),
      creator,
      this.platformFeeAddress,
    );
  }

  /**
   * Verifies a purchase from the signed transaction we captured, using only
   * facts our own code can check: the payload commits to the post and media,
   * every input belonged to the buyer, and the creator (and platform) received
   * the expected amounts.
   */
  private verifyEvidence(transactionJson: string, buyer: string, creator: string, amountSompi: string, postId: string, mediaDigest: string): boolean {
    let tx: { payload?: string; inputs?: { utxo?: { scriptPublicKey?: string } }[]; outputs?: { value?: string; scriptPublicKey?: string }[] };
    try { tx = JSON.parse(transactionJson) as typeof tx; } catch { return false; }
    const payload = parsePpvPayload(tx.payload);
    if (tx.payload && (!payload || payload.postId !== postId || payload.mediaHash.digest !== mediaDigest.toLowerCase())) return false;
    const inputs = tx.inputs;
    if (!Array.isArray(inputs) || inputs.length === 0) return false;
    if (!inputs.every((input) => this.addressOf(input.utxo?.scriptPublicKey) === buyer)) return false;
    const amount = BigInt(amountSompi);
    const referrer = payload?.referrer ?? null;
    return outputsPayCreatorAndPlatform(
      (tx.outputs ?? []).map((output) => ({ value: String(output.value), address: this.addressOf(output.scriptPublicKey) })),
      paymentSplit(amount, referrer !== null),
      creator,
      this.platformFeeAddress,
    );
  }

  private addressOf(script: string | undefined): string | undefined {
    if (!script) return undefined;
    try { return addressFromScriptPublicKey(script, this.network)?.toString(); } catch { return undefined; }
  }

  private async requestRetryingMissing<T>(operation: string, path: string): Promise<T | null> {
    let delay = VERIFY_BASE_DELAY_MS;
    for (let attempt = 0; attempt < VERIFY_MAX_ATTEMPTS; attempt++) {
      try {
        return await this.request<T>(operation, path);
      } catch (error) {
        if (!(error instanceof KaspaRequestError) || error.status !== 404) throw error;
        if (attempt === VERIFY_MAX_ATTEMPTS - 1) return null;
        await this.sleep(delay);
        delay = Math.min(delay * 2, VERIFY_MAX_DELAY_MS);
      }
    }
    return null;
  }

  /**
   * Whether the transaction has taken effect on the ledger: at least one of its
   * outputs is now a spendable UTXO at the address named by that output's
   * script. This proves acceptance from a fact the chain itself reports, so it
   * holds on any node regardless of that node's transaction index.
   */
  private async confirmByEffect(transactionJson: string, transactionId: string) {
    const outputs = (
      JSON.parse(transactionJson) as { outputs?: { scriptPublicKey?: string }[] }
    ).outputs ?? [];
    const targets: { index: number; address: string }[] = [];
    outputs.forEach((output, index) => {
      try {
        const address = addressFromScriptPublicKey(output.scriptPublicKey ?? "", this.network);
        if (address) targets.push({ index, address: address.toString() });
      } catch {
        // An output whose script has no address cannot be observed by effect.
      }
    });
    let delay = VERIFY_BASE_DELAY_MS;
    for (let attempt = 0; attempt <= VERIFY_MAX_ATTEMPTS; attempt++) {
      for (const target of targets) {
        const utxos = await this.request<Utxo[]>(
          "utxos",
          `/addresses/${encodeURIComponent(target.address)}/utxos`,
        ).catch(() => [] as Utxo[]);
        if (utxos.some((utxo) => utxo.outpoint.transactionId === transactionId && utxo.outpoint.index === target.index)) return true;
      }
      if (attempt < VERIFY_MAX_ATTEMPTS) {
        await this.sleep(delay);
        delay = Math.min(delay * 2, VERIFY_MAX_DELAY_MS);
      }
    }
    return false;
  }

  private async request<T>(operation: string, path: string, init?: RequestInit): Promise<T> {
    return this.metrics.observeDependency("kaspa_rest", operation, async () => {
      const response = await fetch(`${this.api}${path}`, { headers: { "Content-Type": "application/json" }, ...init });
      if (!response.ok) throw new KaspaRequestError(response.status, await response.text());
      const body: unknown = await response.json();
      if (!body || typeof body !== "object")
        throw new Error("INVALID_KASPA_RESPONSE");
      return body as T;
    });
  }
}

class KaspaRequestError extends Error {
  constructor(readonly status: number, body: string) {
    super(`Kaspa request failed: ${status} ${body}`);
  }
}

function scriptFor(address: string): string { const data = address.slice(address.lastIndexOf(":") + 1, -8).split("").map((char) => CHARSET.indexOf(char)); const bytes: number[] = []; let buffer = 0n; let bits = 0; for (const value of data) { buffer = (buffer << 5n) | BigInt(value); bits += 5; while (bits >= 8) { bits -= 8; bytes.push(Number((buffer >> BigInt(bits)) & 255n)); buffer &= (1n << BigInt(bits)) - 1n; } } if (bytes[0] !== 0 || bytes.length !== 33) throw new Error("INVALID_CREATOR_ADDRESS"); return `000020${bytes.slice(1).map((byte) => byte.toString(16).padStart(2, "0")).join("")}ac`; }
/** One payout as the verifier sees it: an amount and the address it reached. */
type PaymentOutput = { value: string; address: string | undefined };
/**
 * Whether a purchase paid what the buyer owes: the creator receives their exact
 * share and the platform receives its fee (or nothing when the fee is waived).
 * The referrer's bonus is deliberately not checked, so a bad referral can never
 * strand a paid buyer. This is the one statement of the payment rule, shared by
 * the chain and evidence paths so they cannot drift apart.
 */
function outputsPayCreatorAndPlatform(outputs: PaymentOutput[], split: PaymentSplit, creator: string, platformAddress: string): boolean {
  if (!outputs.some((output) => output.value === split.creator.toString() && output.address === creator)) return false;
  if (split.platform === 0n) return !outputs.some((output) => output.address === platformAddress);
  return outputs.some((output) => output.value === split.platform.toString() && output.address === platformAddress);
}
function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
function estimatedFee(inputs: Utxo[], rate: number, outputs: number, payload: string) { if (!Number.isFinite(rate) || rate <= 0) throw new Error("INVALID_FEE_RATE"); const inputSize = inputs.length * (32 + 4 + 8 + 66 + 8 + 2); const outputSize = outputs * (8 + 2 + 8 + 34); const transactionSize = 2 + 8 + inputSize + 8 + outputSize + 8 + 20 + 8 + 32 + 8 + payload.length / 2; const scriptPublicKeyMass = 10 * outputs * (2 + 34); const computeMass = transactionSize + scriptPublicKeyMass + 100 * inputs.length * 50; const estimated = BigInt(Math.ceil(computeMass * rate)); const relayFloor = 100n * BigInt(computeMass); return estimated > relayFloor ? estimated : relayFloor; }
function rejected(rejection: string, transactionId: string | null = null): PaymentSubmission { return { isAccepted: false, transactionId, rejection }; }
function hasAllSignatures(transaction: Record<string, unknown>) { return Array.isArray(transaction.inputs) && transaction.inputs.length > 0 && transaction.inputs.every((input) => { const signature = (input as Record<string, unknown>).signatureScript; return typeof signature === "string" && signature.length > 0 && signature.length % 2 === 0 && /^[0-9a-f]+$/i.test(signature) && signature.endsWith("01"); }); }
function isTransactionShape(transaction: Record<string, unknown>) { return transaction.version === 0 && Array.isArray(transaction.inputs) && transaction.inputs.length > 0 && Array.isArray(transaction.outputs) && transaction.outputs.length > 0 && typeof transaction.subnetworkId === "string" && typeof transaction.lockTime === "string" && typeof transaction.gas === "string" && typeof transaction.storageMass === "string" && typeof transaction.payload === "string"; }
function sameTransaction(original: Record<string, unknown>, signed: Record<string, unknown>) { const keys = ["version", "outputs", "subnetworkId", "lockTime", "gas", "storageMass", "payload"]; if (!keys.every((key) => JSON.stringify(original[key]) === JSON.stringify(signed[key]))) return false; const normalize = (value: unknown) => (value as Record<string, unknown>[]).map((input) => { const utxo = input.utxo as Record<string, unknown>; return { transactionId: input.transactionId, index: input.index, sequence: input.sequence, sigOpCount: input.sigOpCount, computeBudget: input.computeBudget ?? 0, utxo: { amount: utxo.amount, scriptPublicKey: utxo.scriptPublicKey, blockDaaScore: utxo.blockDaaScore, isCoinbase: utxo.isCoinbase } }; }); return JSON.stringify(normalize(original.inputs)) === JSON.stringify(normalize(signed.inputs)); }
