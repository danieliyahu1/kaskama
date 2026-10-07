import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HomePage } from "./HomePage.js";
import { api } from "./kasware.js";
import { appConfig } from "./app-config.js";
import * as homeCopy from "./home-copy.json";

vi.mock("./kasware.js", async () => ({
  ...(await vi.importActual("./kasware.js")),
  api: vi.fn(),
}));

const creatorAddress =
  "kaspatest:qrzjdw58hp75mvvx6aq58kjyg3xjk7pt0k8txpll9sxdary9npn8v3pmkukdl";

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/publish" element={<p>Publish page</p>} />
        <Route path="/creators" element={<p>Creators page</p>} />
        <Route path="/creator/:address" element={<p>Creator page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api).mockResolvedValue([]);
  });

  it("speaks to creators and what they get", async () => {
    renderHome();

    expect(
      screen.getByRole("heading", {
        name: "Get paid by the people who love your work.",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Publish a photo, a video, an audio track, or a document. Set your price. You keep 99%.",
      ),
    ).toBeVisible();
    await screen.findByText("What your fans see");
  });

  it("tells creators what they keep, when they get it, and who controls it", async () => {
    const { container } = renderHome();

    expect(screen.getByText("Where your money goes.")).toBeVisible();
    expect(screen.getByText("You keep 99%.")).toBeVisible();
    expect(screen.getByText("You get paid on the spot.")).toBeVisible();
    expect(screen.getByText("No one can hold your money.")).toBeVisible();
    expect(screen.getByText("Powered by Kaspa")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Powered by Kaspa" }),
    ).toHaveAttribute("href", "https://kaspa.org/");

    const copy = (container.textContent ?? "").toLowerCase();
    for (const rival of ["onlyfans", "patreon"]) {
      expect(copy).not.toContain(rival);
    }
    await screen.findByText("What your fans see");
  });

  it("shows fans what an example creator's page looks like", async () => {
    renderHome();

    expect(screen.getByText("What your fans see")).toBeVisible();
    expect(
      screen.getByRole("img", {
        name: /an example creator's page on kaskama as fans see it/i,
      }),
    ).toHaveAttribute("src", "/fan-view.jpg");
    await screen.findByText("What your fans see");
  });

  it("opens the example creator's real page from the fan view", async () => {
    const user = userEvent.setup();
    renderHome();

    const link = screen.getByRole("link", {
      name: /open the page — no sign-up, just look/i,
    });
    expect(link).toHaveAttribute(
      "href",
      `/creator/${homeCopy.exampleCreatorAddresses[appConfig().network]}`,
    );

    await user.click(link);

    expect(await screen.findByText("Creator page")).toBeVisible();
  });

  it("gives a creator one clear door", async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole("link", { name: "Start publishing" }));

    expect(await screen.findByText("Publish page")).toBeVisible();
  });

  it("gives fans a door of their own", async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole("link", { name: "Browse creators" }));

    expect(await screen.findByText("Creators page")).toBeVisible();
  });

  it("names real creators for fans when the directory has them", async () => {
    vi.mocked(api).mockResolvedValue([
      {
        address: creatorAddress,
        displayAddress: "kaspatest:...",
        displayName: "Maya",
        bio: null,
        avatarUrl: null,
        lastPostedAt: null,
        membership: { offered: true, priceSompi: "2500000000", durationDays: 30 },
      },
    ]);
    const user = userEvent.setup();
    renderHome();

    await user.click(await screen.findByRole("link", { name: "Maya" }));

    expect(await screen.findByText("Creator page")).toBeVisible();
  });

  it("speaks human language, not blockchain jargon", async () => {
    const { container } = renderHome();
    await screen.findByText("What your fans see");
    const copy = (container.textContent ?? "").toLowerCase();

    for (const jargon of ["wallet", "blockchain", "on-chain", "settle"]) {
      expect(copy).not.toContain(jargon);
    }
  });

  it("never tells the visitor to pay before they can act", async () => {
    const { container } = renderHome();
    await screen.findByText("What your fans see");
    const intro = (
      container.querySelector(".home-intro")?.textContent ?? ""
    ).toLowerCase();

    for (const phrasings of ["unlock", "paid post", "pay to"]) {
      expect(intro).not.toContain(phrasings);
    }
  });
});
