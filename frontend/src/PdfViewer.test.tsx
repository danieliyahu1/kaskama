import { act, fireEvent, render } from "@testing-library/react";
import { PdfViewer } from "./PdfViewer.js";

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: () => ({
    promise: new Promise(() => {}),
    destroy: () => Promise.resolve(),
  }),
}));

describe("PdfViewer controls", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function renderViewer(): HTMLElement {
    const { container } = render(
      <PdfViewer src="/api/posts/p1/media" title="Paper" />,
    );
    return container.querySelector(".pdf-reader") as HTMLElement;
  }

  function buttonOf(reader: HTMLElement): HTMLElement {
    return reader.querySelector(".document-fullscreen") as HTMLElement;
  }

  it("keeps the fullscreen control hidden until the pointer moves", () => {
    const reader = renderViewer();
    expect(buttonOf(reader).className).toContain("is-hidden");

    fireEvent.mouseMove(reader, { clientX: 5, clientY: 5 });
    expect(buttonOf(reader).className).not.toContain("is-hidden");
  });

  it("hides the control again once the pointer is still", () => {
    const reader = renderViewer();

    fireEvent.mouseMove(reader, { clientX: 5, clientY: 5 });
    expect(buttonOf(reader).className).not.toContain("is-hidden");

    act(() => vi.advanceTimersByTime(3000));
    expect(buttonOf(reader).className).toContain("is-hidden");
  });

  it("hides the control when the pointer leaves the viewer", () => {
    const reader = renderViewer();

    fireEvent.mouseMove(reader, { clientX: 5, clientY: 5 });
    fireEvent.mouseLeave(reader);
    expect(buttonOf(reader).className).toContain("is-hidden");
  });
});
