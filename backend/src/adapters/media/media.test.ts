import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_AUDIO_BYTES } from "@kaskama/shared";
import { MediaValidationError, verifyMediaFile } from "./media.js";

async function withTempFile(
  name: string,
  prepare: (path: string) => Promise<void>,
  run: (path: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "kaskama-media-test-"));
  const path = join(dir, name);
  try {
    await prepare(path);
    await run(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function categoryOf(path: string): Promise<string> {
  const error = await verifyMediaFile(path).catch((caught: unknown) => caught);
  if (!(error instanceof MediaValidationError)) throw error;
  return error.category;
}

describe("verifyMediaFile", () => {
  it("rejects a file whose bytes are not a supported media type", async () => {
    await withTempFile(
      "notes.txt",
      (path) => writeFile(path, "just some text"),
      async (path) => {
        expect(await categoryOf(path)).toBe("UNSUPPORTED_MEDIA");
      },
    );
  });

  it("rejects an MP3 that exceeds the audio limit", async () => {
    // file-type identifies audio/mpeg from an ID3 tag whose declared size runs
    // past the end of the file. The size check then rejects it before ffprobe
    // runs, so the fixture never needs to be a decodable recording.
    const id3Tag = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x0f, 0x0f, 0x0f, 0x0f]);
    await withTempFile(
      "song.mp3",
      async (path) => {
        await writeFile(path, id3Tag);
        await truncate(path, MAX_AUDIO_BYTES + 1);
      },
      async (path) => {
        expect(await categoryOf(path)).toBe("AUDIO_TOO_LARGE");
      },
    );
  });
});
