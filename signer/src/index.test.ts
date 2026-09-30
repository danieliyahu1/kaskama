import { networkDefinition } from "@kaskama/shared";
import { verifyMessage } from "kaspa-wasm";
import { KaskamaSigner } from "./index.js";

const PRIVATE_KEY = "11".repeat(32);
const ZERO_TXID = "0".repeat(64);

function makeSigner(network: "mainnet" | "testnet-10" = "testnet-10"): KaskamaSigner {
  return new KaskamaSigner({ privateKey: PRIVATE_KEY, network });
}

function walletScript(signer: KaskamaSigner): string {
  return `000020${signer.publicKey}ac`;
}

function postStylePrepared(script: string): string {
  return JSON.stringify({
    id: ZERO_TXID,
    version: 0,
    inputs: [
      {
        transactionId: "22".repeat(32),
        index: 0,
        sequence: "0",
        sigOpCount: 1,
        computeBudget: 0,
        signatureScript: "",
        utxo: {
          amount: "1000000000",
          scriptPublicKey: script,
          blockDaaScore: "0",
          isCoinbase: false,
        },
      },
    ],
    outputs: [{ value: "900000000", scriptPublicKey: script, covenant: null }],
    subnetworkId: "0".repeat(40),
    lockTime: "0",
    gas: "0",
    storageMass: "20000",
    payload: "",
  });
}

describe("KaskamaSigner identity", () => {
  it("derives the address for the selected network and an x-only public key", () => {
    const testnet = makeSigner("testnet-10");
    expect(testnet.address).toMatch(networkDefinition("testnet-10").addressPattern);
    expect(testnet.publicKey).toMatch(/^[0-9a-f]{64}$/);

    const mainnet = makeSigner("mainnet");
    expect(mainnet.address).toMatch(networkDefinition("mainnet").addressPattern);
    expect(mainnet.address).not.toBe(testnet.address);
  });

  it("rejects a malformed private key", () => {
    expect(() => new KaskamaSigner({ privateKey: "not-hex" })).toThrow();
  });
});

describe("KaskamaSigner.signChallenge", () => {
  it("signs the issued challenge so the server's verifier accepts it", () => {
    const signer = makeSigner();
    const message = "Connect to Kaskama. Nonce: 1234";
    const signature = signer.signChallenge(message);

    // The real contract: the backend verifies with kaspa-wasm verifyMessage.
    expect(verifyMessage({ message, signature, publicKey: signer.publicKey })).toBe(
      true,
    );
    // A signature must not authenticate a different message.
    expect(
      verifyMessage({ message: `${message}!`, signature, publicKey: signer.publicKey }),
    ).toBe(false);
  });
});

describe("KaskamaSigner.signPreparedTransaction", () => {
  it("fills the signature with the server's expected form and preserves every other field", () => {
    const signer = makeSigner();
    const prepared = postStylePrepared(walletScript(signer));
    const original = JSON.parse(prepared) as Record<string, unknown>;

    const signed = JSON.parse(signer.signPreparedTransaction(prepared)) as Record<
      string,
      unknown
    >;

    const input = (signed["inputs"] as { signatureScript: string }[])[0]!;
    expect(input.signatureScript).toMatch(/^[0-9a-f]+$/i);
    expect(input.signatureScript.length % 2).toBe(0);
    expect(input.signatureScript.endsWith("01")).toBe(true);

    // Nothing except the one signature script may change.
    expect({ ...signed, inputs: undefined }).toEqual({
      ...original,
      inputs: undefined,
    });
    expect(signed["outputs"]).toEqual(original["outputs"]);
  });

  it("signs only the requested inputs and leaves a pre-signed covenant input untouched", () => {
    const signer = makeSigner();
    const covenantSig = "cd".repeat(65) + "01";
    const otherScript = `000020${"aa".repeat(32)}ac`;
    const covenantId = "ab".repeat(32);
    const prepared = JSON.stringify({
      id: ZERO_TXID,
      version: 1,
      inputs: [
        {
          transactionId: "aa".repeat(32),
          index: 0,
          sequence: "0",
          sigOpCount: 0,
          computeBudget: 50,
          signatureScript: covenantSig,
          utxo: {
            address: null,
            amount: "50000000",
            scriptPublicKey: otherScript,
            blockDaaScore: "0",
            isCoinbase: false,
            covenantId,
          },
        },
        {
          transactionId: "bb".repeat(32),
          index: 0,
          sequence: "0",
          sigOpCount: 0,
          computeBudget: 50,
          signatureScript: "",
          utxo: {
            address: null,
            amount: "2000000000",
            scriptPublicKey: walletScript(signer),
            blockDaaScore: "0",
            isCoinbase: false,
            covenantId: null,
          },
        },
      ],
      outputs: [
        {
          value: "50000000",
          scriptPublicKey: otherScript,
          covenant: { authorizingInput: 0, covenantId },
        },
        { value: "900000000", scriptPublicKey: walletScript(signer), covenant: null },
      ],
      subnetworkId: "0".repeat(40),
      lockTime: "0",
      gas: "0",
      storageMass: "0",
      payload: "",
    });

    const signed = JSON.parse(signer.signPreparedTransaction(prepared, [1])) as {
      inputs: { signatureScript: string }[];
    };

    expect(signed.inputs[0]!.signatureScript).toBe(covenantSig);
    expect(signed.inputs[1]!.signatureScript).toMatch(/^[0-9a-f]+$/i);
    expect(signed.inputs[1]!.signatureScript.endsWith("01")).toBe(true);
  });

  it("does not sign an input the caller did not ask for", () => {
    const signer = makeSigner();
    const prepared = postStylePrepared(walletScript(signer));
    const signed = JSON.parse(signer.signPreparedTransaction(prepared, [])) as {
      inputs: { signatureScript: string }[];
    };
    expect(signed.inputs[0]!.signatureScript).toBe("");
  });

  it("rejects a transaction that is not the prepared shape", () => {
    const signer = makeSigner();
    expect(() => signer.signPreparedTransaction("not json")).toThrow(
      "PREPARED_TRANSACTION_INVALID",
    );
    expect(() =>
      signer.signPreparedTransaction(JSON.stringify({ inputs: [{}] })),
    ).toThrow("PREPARED_TRANSACTION_INVALID");
  });
});
