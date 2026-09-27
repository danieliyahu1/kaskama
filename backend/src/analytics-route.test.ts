import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createMetrics } from "./metrics.js";
import { MemoryStore } from "./memory-store.js";
import type { ObjectStorage } from "./application/ports.js";

function testAnalyticsApp() {
  const storage: ObjectStorage = {
    putFile: async () => undefined,
    readRange: async () => ({
      bytes: new Uint8Array(),
      size: 0,
      contentType: "image/jpeg",
    }),
    delete: async () => undefined,
  };
  const metrics = createMetrics({ version: "test", revision: "test" });
  const app = createApp({
    store: new MemoryStore(),
    storage,
    walletVerifier: { verify: async () => false },
    publicOrigin: "http://localhost:5173",
    metrics,
  });
  return { app, metrics };
}

describe("POST /api/analytics/publish-click", () => {
  it("counts a publish click without requiring a session", async () => {
    const { app, metrics } = testAnalyticsApp();

    await request(app).post("/api/analytics/publish-click").expect(204);

    const values = (
      await metrics.registry.getSingleMetric("kaskama_publish_click_total")!.get()
    ).values;
    expect(values).toEqual([expect.objectContaining({ labels: {}, value: 1 })]);
  });
});
