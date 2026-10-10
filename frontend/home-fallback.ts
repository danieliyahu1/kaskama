// Baked here rather than imported from @kaskama/shared: vite.config.ts bundles
// this module with esbuild, which does not apply the package's `development`
// export condition, so it cannot resolve the package before it is built.
// home-fallback.test.ts pins these to the shared constants.
const LLMS_TXT_PATH = "/llms.txt";
const AGENT_GUIDE_PATH = "/docs/agent-guide.md";
const OPENAPI_PATH = "/api/openapi.json";

export interface HomeCopy {
  headline: string;
  lede: string;
  moneyHeading: string;
  moneyIntro: string;
  moneyPoints: { claim: string; detail: string }[];
  fanViewHeading: string;
  fanViewIntro: string;
  fanViewLinkLabel: string;
  exampleCreatorAddresses: { mainnet: string; "testnet-10": string };
  fanHeading: string;
  fanLede: string;
  agentsHeading: string;
  agentsLede: string;
}

/**
 * Static homepage shell baked into index.html. Crawlers that do not run
 * JavaScript still see the 1% fee, KAS payments, and 30-day subscriptions.
 * It is wrapped in <noscript> so a browser that runs the app never paints a
 * second, poorer copy of the homepage before React mounts.
 */
export function homeFallbackHtml(copy: HomeCopy): string {
  const points = copy.moneyPoints
    .map(
      (point) =>
        '<li><p class="money-claim">' +
        `${escapeHtml(point.claim)}</p>` +
        `<p class="money-detail">${escapeHtml(point.detail)}</p></li>`,
    )
    .join("");
  return (
    "<noscript>" +
    '<div class="home-page">' +
    '<section class="home-section home-intro">' +
    `<h1>${escapeHtml(copy.headline)}</h1>` +
    `<p class="home-lede">${escapeHtml(copy.lede)}</p>` +
    "</section>" +
    '<section class="home-section home-why">' +
    `<h2 class="home-section-title">${escapeHtml(copy.moneyHeading)}</h2>` +
    `<p class="home-lede">${escapeHtml(copy.moneyIntro)}</p>` +
    `<ul class="home-money">${points}</ul>` +
    '<a class="home-powered" href="https://kaspa.org/">Powered by Kaspa</a>' +
    "</section>" +
    '<section class="home-section">' +
    `<h2 class="home-section-title">${escapeHtml(copy.fanViewHeading)}</h2>` +
    `<p class="home-lede">${escapeHtml(copy.fanViewIntro)}</p>` +
    // The baked shell targets production, which is mainnet.
    `<a class="fan-view-link" href="/creator/${escapeHtml(copy.exampleCreatorAddresses.mainnet)}">` +
    '<img class="fan-view" src="/fan-view.jpg" alt="An example creator\'s page on Kaskama as fans see it: a 30-day subscription, a locked post, and an unlocked post." />' +
    `<span class="fan-view-label">${escapeHtml(copy.fanViewLinkLabel)}</span>` +
    "</a>" +
    "</section>" +
    '<section class="home-section">' +
    `<h2 class="home-section-title">${escapeHtml(copy.fanHeading)}</h2>` +
    `<p class="home-lede">${escapeHtml(copy.fanLede)}</p>` +
    "</section>" +
    '<section class="home-section">' +
    `<h2 class="home-section-title">${escapeHtml(copy.agentsHeading)}</h2>` +
    `<p class="home-lede">${escapeHtml(copy.agentsLede)}</p>` +
    '<ul class="fan-creators">' +
    `<li><a href="${LLMS_TXT_PATH}">${LLMS_TXT_PATH}</a></li>` +
    `<li><a href="${AGENT_GUIDE_PATH}">${AGENT_GUIDE_PATH}</a></li>` +
    `<li><a href="${OPENAPI_PATH}">${OPENAPI_PATH}</a></li>` +
    "</ul>" +
    "</section>" +
    "</div>" +
    "</noscript>"
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
