import { render } from "@testing-library/react";
import type { PostResponse } from "@kaskama/shared";
import { PostMedia } from "./PostMedia.js";

function post(mediaType: PostResponse["mediaType"]): PostResponse {
  return {
    id: "post-1",
    creator: "kaspatest:creator",
    caption: "A private moment",
    priceSompi: "0",
    mediaType,
    publishedAt: new Date(0).toISOString(),
    canView: true,
  };
}

describe("PostMedia", () => {
  it("plays audio on its own quiet stage inside the shared player", () => {
    const { container } = render(<PostMedia post={post("audio/mpeg")} />);
    expect(container.querySelector("video")).toBeInTheDocument();
    expect(container.querySelector(".audio-stage")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("plays video through the shared player without the audio stage", () => {
    const { container } = render(<PostMedia post={post("video/mp4")} />);
    expect(container.querySelector("video")).toBeInTheDocument();
    expect(container.querySelector(".audio-stage")).toBeNull();
  });

  it("renders an image post as an image", () => {
    const { container } = render(<PostMedia post={post("image/png")} />);
    expect(container.querySelector("img.post-media")).toBeInTheDocument();
    expect(container.querySelector("video")).toBeNull();
  });
});
