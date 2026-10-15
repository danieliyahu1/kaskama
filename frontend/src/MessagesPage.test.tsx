import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MessagesPage } from "./MessagesPage.js";
import { api, ApiError } from "./kasware.js";
import { compactAddress } from "./format.js";
import { creatorAddress, consumerAddress } from "./test-fixtures.js";

vi.mock("./kasware.js", async () => ({
  ...(await vi.importActual("./kasware.js")),
  api: vi.fn(),
}));

function renderMessages(address: string | null) {
  render(
    <MemoryRouter initialEntries={["/messages"]}>
      <Routes>
        <Route
          path="/messages"
          element={
            <MessagesPage
              address={address}
              signIn={vi.fn(async () => address)}
              signingIn={false}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("MessagesPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists conversations with the other person and the last thing said", async () => {
    vi.mocked(api).mockResolvedValue({
      threads: [
        {
          address: creatorAddress,
          displayAddress: compactAddress(creatorAddress),
          displayName: "Alina",
          avatarUrl: null,
          counterpartIsCreator: true,
          lastMessage: "thanks for the tutorial!",
          lastMessageAt: new Date(Date.now() - 2 * 60_000).toISOString(),
          unread: 2,
        },
      ],
    });
    renderMessages(consumerAddress);

    expect(await screen.findByText("Alina")).toBeVisible();
    expect(screen.getByText("thanks for the tutorial!")).toBeVisible();
    expect(screen.getByLabelText("2 unread")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Alina/ })).toHaveAttribute(
      "href",
      `/messages/${encodeURIComponent(creatorAddress)}`,
    );
  });

  it("falls back to the address when the other person has no name", async () => {
    vi.mocked(api).mockResolvedValue({
      threads: [
        {
          address: creatorAddress,
          displayAddress: compactAddress(creatorAddress),
          displayName: null,
          avatarUrl: null,
          counterpartIsCreator: true,
          lastMessage: "hi",
          lastMessageAt: new Date().toISOString(),
          unread: 0,
        },
      ],
    });
    renderMessages(consumerAddress);

    expect(await screen.findByText(compactAddress(creatorAddress))).toBeVisible();
    expect(screen.queryByLabelText(/unread/)).not.toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    vi.mocked(api).mockResolvedValue({ threads: [] });
    renderMessages(consumerAddress);

    expect(await screen.findByText("No messages yet.")).toBeVisible();
  });

  it("asks for a wallet when no one is signed in", async () => {
    renderMessages(null);

    expect(await screen.findByText("Sign in to see your messages.")).toBeVisible();
    expect(api).not.toHaveBeenCalled();
  });

  it("shows an error when messages cannot be loaded", async () => {
    vi.mocked(api).mockRejectedValue(
      new ApiError("SERVER_UNAVAILABLE", "Server down", 0),
    );
    renderMessages(consumerAddress);

    expect(await screen.findByText("Server down")).toBeVisible();
  });
});
