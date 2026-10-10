import * as homeCopy from "./home-copy.json";
import {
  AGENT_GUIDE_PATH,
  LLMS_TXT_PATH,
  OPENAPI_PATH,
} from "@kaskama/shared";
import { homeFallbackHtml } from "../home-fallback.js";

describe("homeFallbackHtml", () => {
  it("carries the fee and payment facts a JavaScript-free crawler needs", () => {
    const html = homeFallbackHtml(homeCopy);

    expect(html).toContain("Kaskama takes 1%");
    expect(html).toContain("Powered by Kaspa");
  });

  it("carries the subscription facts", () => {
    const html = homeFallbackHtml(homeCopy);

    expect(html).toContain("subscribe for 30 days");
    expect(html).toContain("KAS");
  });

  it("carries the static fan view image", () => {
    const html = homeFallbackHtml(homeCopy);

    expect(html).toContain('src="/fan-view.jpg"');
  });

  it("makes the example creator a real door without JavaScript", () => {
    const html = homeFallbackHtml(homeCopy);

    expect(html).toContain(
      `href="/creator/${homeCopy.exampleCreatorAddresses.mainnet}"`,
    );
    expect(html).toContain(homeCopy.fanViewLinkLabel);
  });

  it("mirrors the copy rendered on the page", () => {
    const html = homeFallbackHtml(homeCopy);

    expect(html).toContain(homeCopy.headline);
    expect(html).toContain(homeCopy.lede);
    expect(html).toContain(homeCopy.moneyHeading);
    expect(html).toContain(homeCopy.fanViewHeading);
    expect(html).toContain(homeCopy.fanViewIntro);
    expect(html).toContain(homeCopy.fanHeading);
    expect(html).toContain(homeCopy.agentsHeading);
  });

  it("hides the shell from a browser that runs the app", () => {
    const html = homeFallbackHtml(homeCopy);

    expect(html.startsWith("<noscript>")).toBe(true);
    expect(html.endsWith("</noscript>")).toBe(true);
  });

  it("hands a JavaScript-free client the machine entry points the server serves", () => {
    const html = homeFallbackHtml(homeCopy);

    for (const path of [LLMS_TXT_PATH, AGENT_GUIDE_PATH, OPENAPI_PATH])
      expect(html).toContain(`href="${path}"`);
  });

  it("escapes copy so the shell stays valid HTML", () => {
    const html = homeFallbackHtml({ ...homeCopy, headline: "<script>" });

    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
