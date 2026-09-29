import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

describe("index.html", () => {
  it("describes the product in initial metadata", () => {
    expect(html).toContain(
      "<title>Kaskama - A subscription platform for creators</title>",
    );
    expect(html).toContain('name="description"');
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('href="https://kaskama.com/"');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:card"');
    expect(html).toContain('type="application/ld+json"');
  });
});
