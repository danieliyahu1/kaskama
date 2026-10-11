/**
 * Confirming a transaction from the one fact that decides it: the ledger
 * accepted it.
 *
 * A transaction is atomic. Once the ledger accepts it, every output it declares
 * exists and everyone it pays is paid, so there is nothing to learn from
 * watching a particular output — and a visible output is only a proxy that can
 * be satisfied while the transaction is still merely relayed. Asking the
 * transaction itself is what makes "confirmed" mean one thing for every caller:
 * the payment and membership gateways, the reconciler, and the client that reads
 * the result.
 */

export type Sleep = (milliseconds: number) => Promise<void>;

/**
 * A node request as both gateways make it: an operation name for metrics, a
 * path, and optional fetch init. The response is untyped here; the one caller
 * that reads a field validates it.
 */
export type ChainRequest = (
  operation: string,
  path: string,
  init?: RequestInit,
) => Promise<unknown>;

export interface ObservationSchedule {
  /** Extra attempts after the first lookup. */
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

/**
 * Whether the ledger has accepted the transaction. The node answers this from
 * the transaction id alone — no per-address index and no served transaction body
 * — so it holds for both plain payments and covenant transactions.
 */
export async function transactionAccepted(
  request: ChainRequest,
  transactionId: string,
): Promise<boolean> {
  const rows = (await request(
    "transaction_acceptance",
    "/transactions/acceptance",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionIds: [transactionId] }),
    },
  )) as { accepted: boolean }[];
  return rows[0]?.accepted === true;
}

/**
 * Waits for the ledger to accept the transaction. A transaction that is not
 * accepted yet is pending, not rejected: the caller records it as submitted and
 * the reconciler settles it later. A transient lookup failure is treated as "not
 * accepted yet" for the same reason.
 */
export async function awaitAcceptance(
  request: ChainRequest,
  transactionId: string,
  sleep: Sleep,
  schedule: ObservationSchedule,
): Promise<boolean> {
  let delay = schedule.baseDelayMs;
  for (let attempt = 0; attempt <= schedule.attempts; attempt++) {
    const accepted = await transactionAccepted(request, transactionId).catch(
      () => false,
    );
    if (accepted) return true;
    if (attempt < schedule.attempts) {
      await sleep(delay);
      delay = Math.min(delay * 2, schedule.maxDelayMs);
    }
  }
  return false;
}
