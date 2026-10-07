import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PublicCreatorsPage } from "./PublicCreatorsPage.js";
import { compactAddress } from "./format.js";
import { api, ApiError } from "./kasware.js";

vi.mock("./kasware.js", async () => ({
  ...(await vi.importActual("./kasware.js")),
  api: vi.fn(),
}));

const address =
  "kaspatest:qrzjdw58hp75mvvx6aq58kjyg3xjk7pt0k8txpll9sxdary9npn8v3pmkukdl";

const writeText = vi.fn().mockResolvedValue(undefined);

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/creators"]}>
      <Routes>
        <Route path="/creators" element={<PublicCreatorsPage />} />
        <Route path="/creator/:address" element={<p>Profile</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function cardFor(name: string): HTMLElement {
  const card = screen.getByText(name).closest("article");
  if (!card) throw new Error(`No card for ${name}`);
  return card;
}

describe("PublicCreatorsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  it("opens a creator's page from anywhere on the card", async () => {
    vi.mocked(api).mockResolvedValue([
      {
        address,
        displayAddress: "kaspatest:...",
        displayName: "Maya",
        bio: "Ambient music for deep work.",
        avatarUrl: "/api/creators/abc/avatar",
        lastPostedAt: null,
        membership: { offered: true, priceSompi: "2500000000", durationDays: 30 },
      },
    ]);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Maya")).toBeVisible();
    expect(screen.getByText(compactAddress(address))).toBeVisible();
    expect(screen.getByText("Ambient music for deep work.")).toBeVisible();
    await user.click(screen.getByRole("link", { name: "Open Maya's page" }));
    expect(await screen.findByText("Profile")).toBeVisible();
  });

  it("copies the wallet address from the handle", async () => {
    vi.mocked(api).mockResolvedValue([
      {
        address,
        displayAddress: "kaspatest:...",
        displayName: "Maya",
        bio: null,
        avatarUrl: null,
        lastPostedAt: null,
        membership: { offered: true, priceSompi: "1000000000", durationDays: 30 },
      },
    ]);
    renderPage();

    await screen.findByText("Maya");
    fireEvent.click(
      screen.getByRole("button", { name: "Copy Maya's wallet address" }),
    );
    expect(writeText).toHaveBeenCalledWith(address);
  });

  it("tells two creators with the same name apart by their address handle", async () => {
    const other = `kaspatest:${"a".repeat(60)}`;
    vi.mocked(api).mockResolvedValue([
      {
        address,
        displayAddress: "kaspatest:...",
        displayName: "Maya",
        bio: null,
        avatarUrl: null,
        lastPostedAt: null,
        membership: { offered: true, priceSompi: "2500000000", durationDays: 30 },
      },
      {
        address: other,
        displayAddress: "kaspatest:...",
        displayName: "Maya",
        bio: null,
        avatarUrl: null,
        lastPostedAt: null,
        membership: { offered: true, priceSompi: "4000000000", durationDays: 30 },
      },
    ]);
    renderPage();

    expect(await screen.findAllByText("Maya")).toHaveLength(2);
    expect(screen.getByText(compactAddress(address))).toBeVisible();
    expect(screen.getByText(compactAddress(other))).toBeVisible();
  });

  it("falls back to a quiet Kaskama mark and shows no bio when a creator has neither", async () => {
    vi.mocked(api).mockResolvedValue([
      {
        address,
        displayAddress: "kaspatest:...",
        displayName: "Zara",
        bio: null,
        avatarUrl: null,
        lastPostedAt: null,
        membership: { offered: true, priceSompi: "1000000000", durationDays: 30 },
      },
    ]);
    renderPage();

    await screen.findByText("Zara");
    const card = cardFor("Zara");
    expect(card.querySelector("img")).toHaveAttribute("src", "/kaskama-logo.svg");
    expect(card.querySelector(".creator-card-line")).toBeNull();
    expect(card.querySelector(".creator-card-posted")).toBeNull();
  });

  it("shows when the creator last posted", async () => {
    vi.mocked(api).mockResolvedValue([
      {
        address,
        displayAddress: "kaspatest:...",
        displayName: "Maya",
        bio: "Ambient music for deep work.",
        avatarUrl: null,
        lastPostedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        membership: { offered: true, priceSompi: "1000000000", durationDays: 30 },
      },
    ]);
    renderPage();

    await screen.findByText("Maya");
    const card = cardFor("Maya");
    expect(card.querySelector(".creator-card-line")?.textContent).toBe(
      "Ambient music for deep work.",
    );
    expect(card.querySelector(".creator-card-posted")?.textContent).toContain(
      "Posted 2d ago",
    );
  });

  it("says 'just now' rather than 'just now ago' for a fresh post", async () => {
    vi.mocked(api).mockResolvedValue([
      {
        address,
        displayAddress: "kaspatest:...",
        displayName: "Maya",
        bio: null,
        avatarUrl: null,
        lastPostedAt: new Date().toISOString(),
        membership: { offered: true, priceSompi: "1000000000", durationDays: 30 },
      },
    ]);
    renderPage();

    await screen.findByText("Maya");
    const card = cardFor("Maya");
    expect(card.querySelector(".creator-card-posted")?.textContent).toContain(
      "Posted just now",
    );
  });

  it("uses the wallet address as the card title when a creator has no name", async () => {
    vi.mocked(api).mockResolvedValue([
      {
        address,
        displayAddress: "kaspatest:...",
        displayName: null,
        bio: null,
        avatarUrl: null,
        lastPostedAt: null,
        membership: { offered: true, priceSompi: "1000000000", durationDays: 30 },
      },
    ]);
    renderPage();

    expect(await screen.findByText(compactAddress(address))).toBeVisible();
  });

  it("shows an empty state", async () => {
    vi.mocked(api).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("No creators yet.")).toBeVisible();
  });

  it("shows an error when the directory cannot be loaded", async () => {
    vi.mocked(api).mockRejectedValue(
      new ApiError("SERVER_UNAVAILABLE", "Server down", 0),
    );
    renderPage();

    expect(await screen.findByText("Server down")).toBeVisible();
    expect(screen.queryByText("No creators yet.")).not.toBeInTheDocument();
  });
});
