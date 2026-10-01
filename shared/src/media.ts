/**
 * The single source of truth for the media Kaskama accepts. Every layer reads
 * one of these definitions instead of re-listing the types: the client's
 * pre-upload hint, the server's validation, and the docs.
 * Adding a format is one row here, not a new branch in each layer.
 */

export const MEDIA_CATEGORIES = ["image", "video", "audio", "document"] as const;
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

/** Per-category size ceilings, the one place each number is written. */
const CATEGORY_LIMITS: Record<MediaCategory, number> = {
  image: 25_000_000,
  video: 100_000_000,
  audio: 25_000_000,
  document: 25_000_000,
};

export const MAX_IMAGE_BYTES = CATEGORY_LIMITS.image;
export const MAX_VIDEO_BYTES = CATEGORY_LIMITS.video;
export const MAX_AUDIO_BYTES = CATEGORY_LIMITS.audio;
export const MAX_DOCUMENT_BYTES = CATEGORY_LIMITS.document;

const SUPPORTED_MEDIA = [
  { mime: "image/jpeg", category: "image", label: "JPEG" },
  { mime: "image/png", category: "image", label: "PNG" },
  { mime: "image/webp", category: "image", label: "WebP" },
  { mime: "video/mp4", category: "video", label: "MP4" },
  { mime: "video/webm", category: "video", label: "WebM" },
  { mime: "audio/mpeg", category: "audio", label: "MP3" },
  { mime: "application/pdf", category: "document", label: "PDF" },
] as const;

export type MediaType = (typeof SUPPORTED_MEDIA)[number]["mime"];

/** The accepted MIME types, in the order they are advertised. */
export const MEDIA_TYPES: readonly MediaType[] = SUPPORTED_MEDIA.map(
  (media) => media.mime,
);

export interface MediaDefinition {
  mime: MediaType;
  category: MediaCategory;
  /** Short name used when listing the accepted types. */
  label: string;
  maxBytes: number;
}

export const MEDIA_DEFINITIONS: readonly MediaDefinition[] = SUPPORTED_MEDIA.map(
  (media) => ({ ...media, maxBytes: CATEGORY_LIMITS[media.category] }),
);

export const MEDIA_CATEGORY_LABELS: Record<MediaCategory, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  document: "Document",
};

const BY_MIME = new Map<string, MediaDefinition>(
  MEDIA_DEFINITIONS.map((definition) => [definition.mime, definition]),
);

/**
 * Browsers disagree on the MIME type of the same bytes: an MP3 may arrive as
 * `audio/mp3` or `audio/x-mp3`, which the server later detects as `audio/mpeg`.
 * Fold the known aliases so a client hint never rejects a file the server takes.
 */
const MEDIA_TYPE_ALIASES: Record<string, MediaType> = {
  "audio/mp3": "audio/mpeg",
  "audio/x-mp3": "audio/mpeg",
};

export function normalizeMediaType(type: string): string {
  const normalized = type.toLowerCase();
  return MEDIA_TYPE_ALIASES[normalized] ?? normalized;
}

export function mediaDefinition(type: string): MediaDefinition | null {
  return BY_MIME.get(normalizeMediaType(type)) ?? null;
}

export function isMediaType(type: string): type is MediaType {
  return mediaDefinition(type) !== null;
}

export function mediaCategory(type: string): MediaCategory | null {
  return mediaDefinition(type)?.category ?? null;
}

export function isVideoMedia(mediaType: MediaType): boolean {
  return mediaCategory(mediaType) === "video";
}

export function isAudioMedia(mediaType: MediaType): boolean {
  return mediaCategory(mediaType) === "audio";
}

export function isDocumentMedia(mediaType: MediaType): boolean {
  return mediaCategory(mediaType) === "document";
}

const megabytes = (bytes: number) => `${bytes / 1_000_000} MB`;

function joinWithOr(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")}, or ${items.at(-1)}`;
}

export const MEDIA_COPY = {
  unsupportedMedia: `Choose a ${joinWithOr(MEDIA_DEFINITIONS.map((d) => d.label))} file.`,
  tooLarge: {
    image: `Images can be up to ${megabytes(MAX_IMAGE_BYTES)}.`,
    video: `Videos can be up to ${megabytes(MAX_VIDEO_BYTES)}.`,
    audio: `Audio can be up to ${megabytes(MAX_AUDIO_BYTES)}.`,
    document: `Documents can be up to ${megabytes(MAX_DOCUMENT_BYTES)}.`,
  },
  invalidPrice: "Enter a KAS price of zero or more, using up to 8 decimal places.",
} as const;

export function mediaHintError(type: string, size: number): string | null {
  const definition = mediaDefinition(type);
  if (!definition) return MEDIA_COPY.unsupportedMedia;
  if (size > definition.maxBytes) return MEDIA_COPY.tooLarge[definition.category];
  return null;
}
