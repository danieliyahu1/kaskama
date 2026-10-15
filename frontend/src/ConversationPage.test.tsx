import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ChatConversationResponse } from "@kaskama/shared";
import { ConversationPage } from "./ConversationPage.js";
import { api } from "./kasware.js";
import { creatorAddress, consumerAddress, ToastSlot } from "./test-fixtures.js";

vi.mock("./kasware.js", async () => ({
  ...(await vi.importActual("./kasware.js")),
  api: vi.fn(),
}));

function conversation(
  canSend: boolean,
  messages: ChatConversationResponse["messages"] = [],
): ChatConversationResponse {
  return {
    address: creatorAddress,
    displayAddress: creatorAddress,
    displayName: "Alina",
    avatarUrl: null,
    canSend,
    messages,
  };
}

function renderConversation(address: string | null = consumerAddress) {
  render(
    <MemoryRouter initialEntries={[`/messages/${creatorAddress}`]}>
      <Routes>
        <Route
          path="/messages/:address"
          element={
            <ConversationPage
              address={address}
              signIn={vi.fn(async () => address)}
              signingIn={false}
            />
          }
        />
      </Routes>
      <ToastSlot />
    </MemoryRouter>,
  );
}

const sentAt = new Date().toISOString();

describe("ConversationPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the thread, telling mine apart from theirs", async () => {
    vi.mocked(api).mockResolvedValue(
      conversation(true, [
        { id: "m1", sender: creatorAddress, mine: false, body: "hello", sentAt },
        { id: "m2", sender: consumerAddress, mine: true, body: "hey", sentAt },
      ]),
    );
    renderConversation();

    expect(await screen.findByText("hello")).toBeVisible();
    expect(screen.getByText("hey").closest("li")).toHaveClass("is-mine");
    expect(screen.getByText("hello").closest("li")).not.toHaveClass("is-mine");
  });

  it("sends a message and shows it", async () => {
    vi.mocked(api).mockResolvedValueOnce(conversation(true)).mockResolvedValueOnce({
      id: "m1",
      sender: consumerAddress,
      mine: true,
      body: "hi there",
      sentAt,
    });
    const user = userEvent.setup();
    renderConversation();

    await user.type(await screen.findByLabelText("Message"), "hi there");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(api).toHaveBeenCalledWith(
      `/api/chat/threads/${encodeURIComponent(creatorAddress)}/messages`,
      { method: "POST", body: JSON.stringify({ body: "hi there" }) },
    );
    expect(await screen.findByText("hi there")).toBeVisible();
  });

  it("keeps the words when sending fails", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce(conversation(true))
      .mockRejectedValueOnce(new Error("Message not sent."));
    const user = userEvent.setup();
    renderConversation();

    const input = await screen.findByLabelText("Message");
    await user.type(input, "unlucky");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Message not sent.")).toBeVisible();
    expect(input).toHaveValue("unlucky");
  });

  it("gates the composer behind a subscription when the reader lapsed", async () => {
    vi.mocked(api).mockResolvedValue(conversation(false));
    renderConversation();

    expect(await screen.findByText("Subscribe to message Alina.")).toBeVisible();
    expect(screen.queryByLabelText("Message")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Subscribe" })).toHaveAttribute(
      "href",
      `/checkout/${creatorAddress.split(":")[1]}`,
    );
  });

  it("asks for a wallet when no one is signed in", async () => {
    renderConversation(null);

    expect(await screen.findByText("Sign in to message this creator.")).toBeVisible();
    expect(api).not.toHaveBeenCalled();
  });
});
