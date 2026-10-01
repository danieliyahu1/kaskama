import {
  MAX_AUDIO_BYTES,
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MEDIA_COPY,
  MEDIA_DEFINITIONS,
  MEDIA_TYPES,
  isAudioMedia,
  isDocumentMedia,
  isMediaType,
  isVideoMedia,
  mediaCategory,
  mediaDefinition,
  mediaHintError,
} from "./media.js";

describe("media registry", () => {
  it("advertises every supported definition and nothing else", () => {
    expect(MEDIA_TYPES).toEqual(MEDIA_DEFINITIONS.map((d) => d.mime));
    expect(MEDIA_TYPES).toContain("application/pdf");
  });

  it("classifies each type into exactly one category", () => {
    expect(mediaCategory("image/jpeg")).toBe("image");
    expect(mediaCategory("video/webm")).toBe("video");
    expect(mediaCategory("audio/mpeg")).toBe("audio");
    expect(mediaCategory("application/pdf")).toBe("document");
    expect(mediaCategory("text/plain")).toBeNull();
  });

  it("flags the playable and document categories", () => {
    expect(isVideoMedia("video/mp4")).toBe(true);
    expect(isVideoMedia("image/png")).toBe(false);
    expect(isAudioMedia("audio/mpeg")).toBe(true);
    expect(isAudioMedia("video/mp4")).toBe(false);
    expect(isDocumentMedia("application/pdf")).toBe(true);
    expect(isDocumentMedia("image/png")).toBe(false);
  });

  it("resolves browser MIME aliases onto the canonical type", () => {
    expect(mediaDefinition("audio/mp3")?.mime).toBe("audio/mpeg");
    expect(mediaDefinition("AUDIO/X-MP3")?.mime).toBe("audio/mpeg");
    expect(isMediaType("audio/mp3")).toBe(true);
  });
});

describe("media hint validation", () => {
  it("rejects unsupported and oversized media before upload", () => {
    expect(mediaHintError("text/plain", 1)).toBe(MEDIA_COPY.unsupportedMedia);
    expect(mediaHintError("image/png", MAX_IMAGE_BYTES + 1)).toBe(
      MEDIA_COPY.tooLarge.image,
    );
    expect(mediaHintError("image/png", MAX_IMAGE_BYTES)).toBeNull();
  });

  it("measures each category against its own limit", () => {
    expect(mediaHintError("video/mp4", MAX_VIDEO_BYTES + 1)).toBe(
      MEDIA_COPY.tooLarge.video,
    );
    expect(mediaHintError("audio/mpeg", MAX_AUDIO_BYTES + 1)).toBe(
      MEDIA_COPY.tooLarge.audio,
    );
    expect(mediaHintError("audio/mpeg", MAX_AUDIO_BYTES)).toBeNull();
  });

  it("accepts a PDF up to its document limit", () => {
    expect(mediaHintError("application/pdf", MAX_DOCUMENT_BYTES)).toBeNull();
    expect(mediaHintError("application/pdf", MAX_DOCUMENT_BYTES + 1)).toBe(
      MEDIA_COPY.tooLarge.document,
    );
  });

  it("lists PDF among the accepted types", () => {
    expect(MEDIA_COPY.unsupportedMedia).toContain("PDF");
  });

  it("folds browser MP3 aliases onto the canonical type", () => {
    expect(mediaHintError("audio/mp3", 1)).toBeNull();
    expect(mediaHintError("AUDIO/X-MP3", 1)).toBeNull();
  });
});
