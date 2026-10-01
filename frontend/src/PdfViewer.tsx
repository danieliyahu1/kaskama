import { useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFPageProxy,
  type RenderTask,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { VideoIcon } from "./Icons.js";
import { Spinner } from "./Spinner.js";

GlobalWorkerOptions.workerSrc = workerUrl;

/** How long the fullscreen control lingers after the pointer stops moving. */
const CONTROLS_IDLE_MS = 3000;

/**
 * Reads a PDF with pdf.js so we own the whole experience. Pages are drawn
 * fit-to-width and stacked, so the reader scrolls naturally, and one button
 * expands it to the full screen. No browser viewer chrome leaks in, and the
 * page refits when the reader resizes or goes fullscreen.
 */
export function PdfViewer({ src, title }: { src: string; title: string }) {
  const root = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const container = scroll.current;
    if (!container) return;
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    let pages: PDFPageProxy[] = [];
    const renders = new Map<HTMLCanvasElement, RenderTask>();

    function contentWidth(): number {
      const style = getComputedStyle(container!);
      return (
        container!.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight)
      );
    }

    async function paint() {
      const width = contentWidth();
      if (width <= 0) return;
      const canvases = Array.from(
        container!.querySelectorAll<HTMLCanvasElement>("canvas.pdf-page"),
      );
      await Promise.all(
        canvases.map((canvas, index) => {
          const page = pages[index];
          return page
            ? paintPage(page, canvas, width, renders)
            : Promise.resolve();
        }),
      );
    }

    async function load() {
      try {
        task = getDocument({ url: src, withCredentials: true, useSystemFonts: true });
        const pdf = await task.promise;
        if (cancelled) return;
        pages = [];
        for (let number = 1; number <= pdf.numPages; number++)
          pages.push(await pdf.getPage(number));
        if (cancelled) return;
        container!.replaceChildren();
        pages.forEach((_, index) => {
          const canvas = document.createElement("canvas");
          canvas.className = "pdf-page";
          canvas.setAttribute("aria-label", `Page ${index + 1} of ${pages.length}`);
          container!.append(canvas);
        });
        await paint();
        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("failed");
      }
    }

    void load();

    let frame = 0;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => void paint());
          });
    observer?.observe(container);

    return () => {
      cancelled = true;
      observer?.disconnect();
      cancelAnimationFrame(frame);
      for (const render of renders.values()) render.cancel();
      renders.clear();
      void task?.destroy();
    };
  }, [src]);

  useEffect(() => {
    const sync = () =>
      setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.current?.requestFullscreen();
  }

  function clearHideTimer() {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }

  function showControls() {
    setControlsVisible(true);
    clearHideTimer();
    hideTimer.current = setTimeout(() => {
      hideTimer.current = null;
      setControlsVisible(false);
    }, CONTROLS_IDLE_MS);
  }

  function hideControls() {
    clearHideTimer();
    setControlsVisible(false);
  }

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  return (
    <div
      ref={root}
      className="pdf-reader"
      onMouseMove={showControls}
      onMouseEnter={showControls}
      onMouseLeave={hideControls}
    >
      <div ref={scroll} className="pdf-scroll" role="document" aria-label={title} />
      {status !== "ready" && (
        <p className="pdf-status" role="status">
          {status === "failed" ? "This document can't be shown here." : <Spinner />}
        </p>
      )}
      <button
        type="button"
        className={`document-fullscreen${controlsVisible ? "" : " is-hidden"}`}
        onClick={toggleFullscreen}
        aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
      >
        <VideoIcon name={fullscreen ? "exit-fullscreen" : "fullscreen"} />
      </button>
    </div>
  );
}

async function paintPage(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  cssWidth: number,
  renders: Map<HTMLCanvasElement, RenderTask>,
): Promise<void> {
  renders.get(canvas)?.cancel();
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: cssWidth / base.width });
  const outputScale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
  canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  const render = page.render({
    canvas,
    viewport,
    transform:
      outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
  });
  renders.set(canvas, render);
  try {
    await render.promise;
  } catch {
    // A resize cancels an in-flight render; the next paint replaces it.
  } finally {
    if (renders.get(canvas) === render) renders.delete(canvas);
  }
}
