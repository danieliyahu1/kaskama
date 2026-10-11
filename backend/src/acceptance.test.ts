import {
  awaitAcceptance,
  transactionAccepted,
  type ChainRequest,
} from "./acceptance.js";

const schedule = { attempts: 2, baseDelayMs: 1_000, maxDelayMs: 4_000 };

describe("transactionAccepted", () => {
  it("asks the node about the transaction and reads the accepted flag", async () => {
    const calls: {
      operation: string;
      path: string;
      init: RequestInit | undefined;
    }[] = [];
    const request: ChainRequest = async (operation, path, init) => {
      calls.push({ operation, path, init });
      return [{ transactionId: "tx", accepted: true }];
    };

    await expect(transactionAccepted(request, "tx")).resolves.toBe(true);
    expect(calls[0]!.operation).toBe("transaction_acceptance");
    expect(calls[0]!.path).toBe("/transactions/acceptance");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({
      transactionIds: ["tx"],
    });
  });

  it("treats an absent or unaccepted row as not accepted", async () => {
    const empty: ChainRequest = async () => [];
    const unaccepted: ChainRequest = async () => [{ accepted: false }];

    await expect(transactionAccepted(empty, "tx")).resolves.toBe(false);
    await expect(transactionAccepted(unaccepted, "tx")).resolves.toBe(false);
  });
});

describe("awaitAcceptance", () => {
  const request = (accepted: boolean): ChainRequest => async () => [
    { accepted },
  ];

  it("confirms as soon as the ledger accepts the transaction", async () => {
    const sleep = vi.fn(async () => undefined);

    await expect(
      awaitAcceptance(request(true), "tx", sleep, schedule),
    ).resolves.toBe(true);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries with backoff before giving up", async () => {
    let calls = 0;
    const counting: ChainRequest = async () => {
      calls += 1;
      return [{ accepted: false }];
    };
    const sleep = vi.fn(async () => undefined);

    await expect(
      awaitAcceptance(counting, "tx", sleep, schedule),
    ).resolves.toBe(false);
    expect(calls).toBe(3);
    expect(sleep.mock.calls).toEqual([[1_000], [2_000]]);
  });

  it("treats a failed lookup as not accepted yet", async () => {
    const failing: ChainRequest = async () => {
      throw new Error("upstream unavailable");
    };
    const sleep = vi.fn(async () => undefined);

    await expect(
      awaitAcceptance(failing, "tx", sleep, schedule),
    ).resolves.toBe(false);
  });
});
