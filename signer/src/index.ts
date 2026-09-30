import {
  PrivateKey,
  Transaction,
  signMessage,
  signTransaction as signTransactionWasm,
} from "@kluster/kaspa-wasm";
import { DEFAULT_NETWORK, type NetworkId } from "@kaskama/shared";

export interface KaskamaSignerOptions {
  /** The account's hex-encoded Kaspa private key. It never leaves the caller. */
  privateKey: string;
  /** Defaults to the network the server selects when none is given. */
  network?: NetworkId;
}

/** A parsed prepared transaction, holding only the field the signer edits. */
interface PreparedInput {
  signatureScript: string;
}

/**
 * A headless Kaspa signer for Kaskama.
 *
 * It performs the two signatures the server requires and nothing else: the
 * authentication challenge message and the prepared transaction returned by a
 * `prepare` endpoint. The backend never holds a private key, so any client --
 * an agent, a CLI, a script -- proves wallet ownership the same way a browser
 * wallet does, by signing.
 */
export class KaskamaSigner {
  private readonly privateKey: PrivateKey;
  /** The wallet address on the configured network. */
  readonly address: string;
  /** The x-only public key, hex-encoded, as the server expects it. */
  readonly publicKey: string;

  constructor(options: KaskamaSignerOptions) {
    this.privateKey = new PrivateKey(options.privateKey);
    const keypair = this.privateKey.toKeypair();
    const network = options.network ?? DEFAULT_NETWORK;
    this.address = keypair.toAddress(network).toString();
    this.publicKey = keypair.xOnlyPublicKey.toString();
  }

  /**
   * Signs the challenge message issued by `POST /api/auth/challenge`. The
   * signature is the value the caller sends to `POST /api/auth/session`.
   */
  signChallenge(message: string): string {
    return signMessage({ message, privateKey: this.privateKey }).toString();
  }

  /**
   * Returns the prepared transaction with the signature scripts filled in.
   *
   * Only inputs whose `signatureScript` is empty are signed. Inputs the server
   * already signed -- covenant inputs in membership transactions -- are copied
   * through unchanged. `signInputs` narrows which inputs to fill; when omitted
   * every unsigned input is signed. Every other field is preserved exactly, so
   * the server's equality check on the prepared template still passes.
   */
  signPreparedTransaction(preparedTransaction: string, signInputs?: number[]): string {
    const prepared = readPrepared(preparedTransaction);
    if (!prepared.inputs.some((input) => input.signatureScript === "")) {
      return preparedTransaction;
    }
    const transaction = Transaction.deserializeFromSafeJSON(preparedTransaction);
    const hasPrefilledInput = prepared.inputs.some(
      (input) => input.signatureScript !== "",
    );
    const signed = signTransactionWasm(
      transaction,
      [this.privateKey],
      !hasPrefilledInput,
    );
    const signedInputs = readPrepared(signed.serializeToSafeJSON()).inputs;
    const targets = signInputs ?? prepared.inputs.map((_, index) => index);
    for (const index of targets) {
      const input = prepared.inputs[index];
      const filled = signedInputs[index];
      if (input !== undefined && filled !== undefined && input.signatureScript === "") {
        input.signatureScript = filled.signatureScript;
      }
    }
    return JSON.stringify(prepared);
  }
}

interface PreparedTransaction {
  inputs: PreparedInput[];
  [key: string]: unknown;
}

/**
 * Reads the prepared transaction JSON and rejects anything that is not the
 * shape the prepare endpoints return. A malformed template must fail here, not
 * produce a half-signed transaction the server silently rejects.
 */
function readPrepared(value: string): PreparedTransaction {
  const parsed = parseObject(value);
  const inputs = parsed["inputs"];
  if (!Array.isArray(inputs)) throw new Error("PREPARED_TRANSACTION_INVALID");
  for (const input of inputs) {
    if (
      typeof input !== "object" ||
      input === null ||
      typeof (input as { signatureScript?: unknown }).signatureScript !== "string"
    ) {
      throw new Error("PREPARED_TRANSACTION_INVALID");
    }
  }
  return parsed as unknown as PreparedTransaction;
}

function parseObject(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("PREPARED_TRANSACTION_INVALID");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("PREPARED_TRANSACTION_INVALID");
  }
  return parsed as Record<string, unknown>;
}
