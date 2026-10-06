import { Link } from "react-router-dom";
import type { CreatorSearchResult } from "@kaskama/shared";
import * as homeCopy from "./home-copy.json";
import { appConfig } from "./app-config.js";
import { api } from "./kasware.js";
import { useAsyncResource } from "./useAsyncResource.js";
import { creatorPath } from "./creator-url.js";

// A picture of what a fan meets, captured from the real product. It is static
// on purpose: nothing here reacts to the visitor.
const FAN_VIEW_ALT =
  "An example creator's page on Kaskama as fans see it: a 30-day subscription, a locked post, and an unlocked post.";

export function HomePage() {
  return (
    <div className="home-page">
      <section className="home-section home-intro">
        <h1>{homeCopy.headline}</h1>
        <p className="home-lede">{homeCopy.lede}</p>
        <div className="home-actions">
          <Link className="primary" to="/publish">
            Start publishing
          </Link>
        </div>
      </section>

      <section className="home-section home-why">
        <h2 className="home-section-title">{homeCopy.moneyHeading}</h2>
        <p className="home-lede">{homeCopy.moneyIntro}</p>
        <ul className="home-money">
          {homeCopy.moneyPoints.map((point) => (
            <li key={point.claim}>
              <p className="money-claim">{point.claim}</p>
              <p className="money-detail">{point.detail}</p>
            </li>
          ))}
        </ul>
        <a
          className="home-powered"
          href="https://kaspa.org/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by Kaspa
        </a>
      </section>

      <section className="home-section">
        <h2 className="home-section-title">{homeCopy.fanViewHeading}</h2>
        <p className="home-lede">{homeCopy.fanViewIntro}</p>
        <Link
          className="fan-view-link"
          to={creatorPath(homeCopy.exampleCreatorAddresses[appConfig().network])}
        >
          <img className="fan-view" src="/fan-view.jpg" alt={FAN_VIEW_ALT} />
          <span className="fan-view-label">{homeCopy.fanViewLinkLabel}</span>
        </Link>
      </section>

      <section className="home-section">
        <h2 className="home-section-title">{homeCopy.fanHeading}</h2>
        <p className="home-lede">{homeCopy.fanLede}</p>
        <FanCreators />
        <Link className="secondary" to="/creators">
          Browse creators
        </Link>
      </section>
    </div>
  );
}

function FanCreators() {
  const { data } = useAsyncResource(
    (signal) => api<CreatorSearchResult[]>("/api/creators/public", { signal }),
    [],
  );
  const creators = (data ?? []).filter((creator) => creator.displayName).slice(0, 4);
  if (!creators.length) return null;
  return (
    <ul className="fan-creators">
      {creators.map((creator) => (
        <li key={creator.address}>
          <Link to={creatorPath(creator.address)}>
            {creator.displayName}
          </Link>
        </li>
      ))}
    </ul>
  );
}
