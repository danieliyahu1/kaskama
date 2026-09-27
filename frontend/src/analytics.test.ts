import { afterEach, describe, expect, it, vi } from "vitest";
import { trackPublishClick } from "./analytics.js";

afterEach(() => vi.unstubAllGlobals());

describe("trackPublishClick", () => {
  it("posts a keepalive beacon to the click endpoint", () => {
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchMock);

    trackPublishClick();

    expect(fetchMock).toHaveBeenCalledWith("/api/analytics/publish-click", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
    });
  });

  it("swallows beacon failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    expect(() => trackPublishClick()).not.toThrow();
    await Promise.resolve();
  });
});
