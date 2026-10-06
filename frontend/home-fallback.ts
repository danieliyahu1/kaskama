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
}

/**
 * Static homepage shell baked into index.html. Crawlers that do not run
 * JavaScript still see the 1% fee, KAS payments, and 30-day subscriptions.
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
    "</div>"
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
