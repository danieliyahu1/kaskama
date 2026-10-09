import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { CreatorResponse, ProfileResponse } from "@kaskama/shared";
import { EditProfilePage } from "./EditProfilePage.js";
import { ApiError, api, signPreparedPayment } from "./kasware.js";
import { uploadAvatar, removeAvatar } from "./upload.js";
import { creatorAddress, ToastSlot } from "./test-fixtures.js";

vi.mock("./kasware.js", async () => ({
  ...(await vi.importActual("./kasware.js")),
  api: vi.fn(),
  signPreparedPayment: vi.fn(),
}));
vi.mock("./upload.js", () => ({
  uploadAvatar: vi.fn(),
  removeAvatar: vi.fn(),
}));

const apiMock = api as unknown as ReturnType<typeof vi.fn>;

const profile: ProfileResponse = {
  address: creatorAddress,
  displayAddress: creatorAddress,
  displayName: "Ambient",
  bio: "Music for deep work",
  avatarUrl: null,
  isPublic: true,
};

function ownerCreator(
  membership: CreatorResponse["membership"] = { offered: false, active: false },
): CreatorResponse {
  return {
    address: creatorAddress,
    displayAddress: creatorAddress,
    displayName: "Ambient",
    bio: "Music for deep work",
    avatarUrl: null,
    isPublic: true,
    isOwner: true,
    membership,
    posts: [],
  };
}

/**
 * A path-aware mock: the page fetches its own creator record for the
 * subscription section, so sequential `mockResolvedValueOnce` would be brittle.
 */
function mockApi({
  creator = ownerCreator(),
  profileValue = profile,
  prepareError,
}: {
  creator?: CreatorResponse;
  profileValue?: ProfileResponse;
  prepareError?: { path: string; error: unknown };
} = {}) {
  apiMock.mockImplementation(async (path: string) => {
    if (prepareError && path === prepareError.path) throw prepareError.error;
    if (path.startsWith("/api/creators/")) return creator;
    if (path === "/api/profile") return profileValue;
    if (path === "/api/membership/price/prepare")
      return { id: "price", transaction: "{}", signInputs: [1] };
    if (path.startsWith("/api/membership/price/")) return { state: "CONFIRMED" };
    if (path === "/api/membership/offers/prepare")
      return { id: "offer", transaction: "{}", signInputs: [0] };
    if (path.startsWith("/api/membership/offers/"))
      return { state: "CONFIRMED" };
    if (path === "/api/membership/cancel/prepare")
      return { id: "cancel", transaction: "{}", signInputs: [1] };
    if (path.startsWith("/api/membership/cancel/"))
      return { state: "CONFIRMED" };
    return undefined;
  });
}

function renderPage({
  profileValue = profile,
  loading = false,
  error = null,
  address = creatorAddress,
  onRetry = vi.fn(),
  onProfileChange = vi.fn(),
}: {
  profileValue?: ProfileResponse | null;
  loading?: boolean;
  error?: string | null;
  address?: string | null;
  onRetry?: () => void;
  onProfileChange?: (value: ProfileResponse) => void;
} = {}) {
  render(
    <MemoryRouter initialEntries={["/profile/edit"]}>
      <Routes>
        <Route
          path="/profile/edit"
          element={
            <EditProfilePage
              address={address}
              signIn={vi.fn(async () => address)}
              signingIn={false}
              profile={profileValue}
              loading={loading}
              error={error}
              onRetry={onRetry}
              onProfileChange={onProfileChange}
            />
          }
        />
      </Routes>
      <ToastSlot />
    </MemoryRouter>,
  );
  return { onRetry, onProfileChange };
}

describe("EditProfilePage identity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("seeds the fields and saves the whole edit with one Save", async () => {
    mockApi({ profileValue: { ...profile, displayName: "Ambient Lab" } });
    const user = userEvent.setup();
    const { onProfileChange } = renderPage();

    expect(screen.getByLabelText("Display name")).toHaveValue("Ambient");
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), "Ambient Lab");
    expect(screen.getByText("Unsaved changes.")).toBeVisible();
    expect(save).toBeEnabled();
    await user.click(save);

    expect(apiMock).toHaveBeenCalledWith("/api/profile", {
      method: "PUT",
      body: JSON.stringify({
        displayName: "Ambient Lab",
        bio: "Music for deep work",
      }),
    });
    expect(onProfileChange).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "Ambient Lab" }),
    );
    expect(await screen.findByText("Profile saved.")).toBeVisible();
  });

  it("stages a chosen photo and commits it on the same Save", async () => {
    const file = new File(["face"], "face.png", { type: "image/png" });
    vi.mocked(uploadAvatar).mockResolvedValueOnce({
      ...profile,
      avatarUrl: "/media/face",
    });
    mockApi();
    const user = userEvent.setup();
    const { onProfileChange } = renderPage();

    await user.upload(screen.getByLabelText("Add photo"), file);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(uploadAvatar).toHaveBeenCalledWith(file);
    // One Save: the text fields did not change, so nothing else was written.
    expect(apiMock).not.toHaveBeenCalledWith("/api/profile", expect.anything());
    expect(onProfileChange).toHaveBeenCalledWith(
      expect.objectContaining({ avatarUrl: "/media/face" }),
    );
  });

  it("stages a photo removal and commits it on Save", async () => {
    vi.mocked(removeAvatar).mockResolvedValueOnce({ ...profile, avatarUrl: null });
    mockApi();
    const user = userEvent.setup();
    renderPage({ profileValue: { ...profile, avatarUrl: "/media/old" } });

    await user.click(screen.getByRole("button", { name: "Remove photo" }));

    expect(screen.getByText("Your photo is removed when you save.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(removeAvatar).toHaveBeenCalled();
    expect(apiMock).not.toHaveBeenCalledWith("/api/profile", expect.anything());
  });

  it("offers a retry when the profile could not be loaded", async () => {
    mockApi();
    const user = userEvent.setup();
    const { onRetry } = renderPage({
      profileValue: null,
      error: "Profile could not be loaded.",
    });

    expect(screen.getByText("Profile could not be loaded.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("asks a signed-out visitor to sign in", () => {
    mockApi();
    renderPage({ address: null, profileValue: null });

    expect(screen.getByText("Sign in to edit your profile.")).toBeVisible();
  });
});

describe("EditProfilePage subscription", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets the owner start a subscription", async () => {
    mockApi({ creator: ownerCreator({ offered: false, active: false }) });
    vi.mocked(signPreparedPayment).mockResolvedValue("signed");
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Start subscription" }),
    );

    expect(apiMock).toHaveBeenCalledWith("/api/membership/offers/prepare", {
      method: "POST",
      body: JSON.stringify({ price: "10" }),
    });
    expect(signPreparedPayment).toHaveBeenCalledWith("{}", [0]);
    expect(apiMock).toHaveBeenCalledWith(
      "/api/membership/offers/offer/finalize",
      { method: "POST", body: JSON.stringify({ signedTransaction: "signed" }) },
    );
    expect(await screen.findByText("Subscription is ready.")).toBeVisible();
  });

  it("sends a changed price to the server and surfaces its rejection", async () => {
    mockApi({
      creator: ownerCreator({
        offered: true,
        active: false,
        priceSompi: "1000000000",
        durationDays: 30,
      }),
      prepareError: {
        path: "/api/membership/price/prepare",
        error: new ApiError(
          "INVALID_MEMBERSHIP_PRICE",
          "Enter a monthly subscription price from 1 to 1,000,000 KAS.",
          400,
        ),
      },
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Update price" }));
    const field = screen.getByLabelText("Monthly subscription price in KAS");
    await user.clear(field);
    await user.type(field, "1,000");
    await user.click(screen.getByRole("button", { name: "Save price" }));

    expect(apiMock).toHaveBeenCalledWith("/api/membership/price/prepare", {
      method: "POST",
      body: JSON.stringify({ price: "1,000" }),
    });
    expect(
      await screen.findByText(
        "Enter a monthly subscription price from 1 to 1,000,000 KAS.",
      ),
    ).toBeVisible();
  });

  it("refreshes and explains when the subscription moved", async () => {
    mockApi({
      creator: ownerCreator({
        offered: true,
        active: false,
        priceSompi: "1000000000",
        durationDays: 30,
      }),
      prepareError: {
        path: "/api/membership/price/prepare",
        error: new ApiError(
          "MEMBERSHIP_OFFER_STALE",
          "This subscription changed. Submit again.",
          409,
          undefined,
          "AFTER_REFRESH",
        ),
      },
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Update price" }));
    await user.click(screen.getByRole("button", { name: "Save price" }));

    expect(
      await screen.findByText("This subscription changed. Submit again."),
    ).toBeVisible();
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(3));
  });
});
