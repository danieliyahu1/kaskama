import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { fileTypeFromFile } from "file-type";
import sharp from "sharp";
import { mediaDefinition, type MediaCategory, type MediaType } from "@kaskama/shared";

const execFileAsync = promisify(execFile);
const ffprobePath = process.env.FFPROBE_PATH ?? bundledFfprobePath();

export interface VerifiedMedia {
  digest: string;
  mediaType: MediaType;
  size: number;
}

type MediaErrorCategory =
  | "UNSUPPORTED_MEDIA"
  | "IMAGE_TOO_LARGE"
  | "VIDEO_TOO_LARGE"
  | "AUDIO_TOO_LARGE"
  | "DOCUMENT_TOO_LARGE"
  | "MALFORMED_MEDIA"
  | "STORAGE_FAILURE";

export class MediaValidationError extends Error {
  constructor(readonly category: MediaErrorCategory) {
    super(category);
  }
}

/** The size error a category raises, mirroring the shared media registry. */
const TOO_LARGE_ERROR: Record<MediaCategory, MediaErrorCategory> = {
  image: "IMAGE_TOO_LARGE",
  video: "VIDEO_TOO_LARGE",
  audio: "AUDIO_TOO_LARGE",
  document: "DOCUMENT_TOO_LARGE",
};

/**
 * How each category proves a file is usable. Keying on the category rather than
 * the MIME type is what keeps `verifyMediaFile` closed to new formats: a new
 * file type only needs a validator when its category is new.
 */
const VERIFIERS: Record<MediaCategory, (path: string) => Promise<void>> = {
  image: decodeCompleteImage,
  video: probeCompleteMedia,
  audio: probeCompleteMedia,
  document: validateCompletePdf,
};

export async function verifyMediaFile(path: string): Promise<VerifiedMedia> {
  const size = (await stat(path)).size;
  const detected = await fileTypeFromFile(path);
  const definition = mediaDefinition(detected?.mime ?? "");
  if (!definition) throw new MediaValidationError("UNSUPPORTED_MEDIA");

  if (size > definition.maxBytes)
    throw new MediaValidationError(TOO_LARGE_ERROR[definition.category]);

  await VERIFIERS[definition.category](path);

  return { digest: await hashFile(path), mediaType: definition.mime, size };
}

async function decodeCompleteImage(path: string): Promise<void> {
  try {
    const discard = new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    });
    await pipeline(sharp(path, { failOn: "error" }).raw(), discard);
  } catch {
    throw new MediaValidationError("MALFORMED_MEDIA");
  }
}

const PDF_HEADER = "%PDF-";
const PDF_TRAILER = "%%EOF";
const PDF_TAIL_BYTES = 1024;

/**
 * A PDF is complete when it carries the header at the start and the end-of-file
 * marker the format requires in its tail. file-type has already matched the
 * magic; this proves the bytes did not stop mid-transfer.
 */
async function validateCompletePdf(path: string): Promise<void> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    const head = Buffer.alloc(Math.min(PDF_HEADER.length, size));
    await handle.read(head, 0, head.length, 0);
    const tail = Buffer.alloc(Math.min(PDF_TAIL_BYTES, size));
    await handle.read(tail, 0, tail.length, size - tail.length);
    if (
      !head.toString("latin1").startsWith(PDF_HEADER) ||
      !tail.toString("latin1").includes(PDF_TRAILER)
    )
      throw new MediaValidationError("MALFORMED_MEDIA");
  } finally {
    await handle.close();
  }
}

async function probeCompleteMedia(path: string): Promise<void> {
  try {
    const { stdout } = await execFileAsync(
      ffprobePath,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration,format_name",
        "-of",
        "json",
        path,
      ],
      { timeout: 30_000, maxBuffer: 1_000_000 },
    );
    const result = JSON.parse(stdout) as {
      format?: { duration?: string; format_name?: string };
    };
    const duration = Number(result.format?.duration);
    if (!Number.isFinite(duration) || duration <= 0 || !result.format?.format_name)
      throw new Error("Invalid media probe");
  } catch (error) {
    if (isExecutableFailure(error)) throw error;
    throw new MediaValidationError("MALFORMED_MEDIA");
  }
}

function bundledFfprobePath(): string {
  try {
    return (createRequire(import.meta.url)("ffprobe-static") as { path: string }).path;
  } catch {
    return "ffprobe";
  }
}

function isExecutableFailure(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "EACCES" || code === "ENOEXEC";
}

async function hashFile(path: string): Promise<string> {
  const hash = blake3.create();
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return bytesToHex(hash.digest());
}
