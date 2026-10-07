import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import Busboy from "busboy";
import type { Request } from "express";
import { MediaValidationError } from "../media/media.js";

/** The image bytes written while reading an avatar upload. */
export interface AvatarUpload {
  bytesWritten: number;
}

/** The request was not a well-formed single-image avatar upload. */
export class InvalidAvatarUploadError extends Error {
  constructor() {
    super("INVALID_AVATAR_UPLOAD");
  }
}

/**
 * Streams a single-image `avatar` upload to `filePath`. Only one file is
 * accepted and no text fields are read: an avatar is an image, and the name and
 * description travel as JSON to the profile endpoint instead.
 */
export function readAvatarUpload(
  request: Request,
  options: { filePath: string; maxBytes: number },
): Promise<AvatarUpload> {
  return new Promise((resolve, reject) => {
    let parser: ReturnType<typeof Busboy>;
    try {
      parser = Busboy({
        headers: request.headers,
        limits: { files: 1, fileSize: options.maxBytes },
      });
    } catch {
      reject(new InvalidAvatarUploadError());
      return;
    }

    let settled = false;
    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      parser.destroy();
      request.unpipe(parser);
      request.resume();
      action();
    };

    let bytesWritten = 0;
    let avatarSeen = false;
    let limitExceeded = false;
    let fileWrite: Promise<void> | undefined;

    parser.on("file", (name, stream) => {
      if (settled) {
        stream.resume();
        return;
      }
      if (name !== "avatar" || avatarSeen) {
        stream.resume();
        settle(() => reject(new InvalidAvatarUploadError()));
        return;
      }
      avatarSeen = true;
      stream.on("data", (chunk: Buffer) => {
        bytesWritten += chunk.byteLength;
      });
      stream.on("limit", () => {
        limitExceeded = true;
      });
      fileWrite = pipeline(
        stream,
        createWriteStream(options.filePath, { flags: "wx" }),
      );
    });

    parser.on("filesLimit", () =>
      settle(() => reject(new InvalidAvatarUploadError())),
    );
    parser.on("fieldsLimit", () =>
      settle(() => reject(new InvalidAvatarUploadError())),
    );
    parser.on("error", () => settle(() => reject(new InvalidAvatarUploadError())));

    parser.on("close", () => {
      void (async () => {
        if (fileWrite) {
          try {
            await fileWrite;
          } catch {
            settle(() => reject(new InvalidAvatarUploadError()));
            return;
          }
        }
        if (limitExceeded) {
          settle(() => reject(new MediaValidationError("IMAGE_TOO_LARGE")));
          return;
        }
        if (!avatarSeen) {
          settle(() => reject(new InvalidAvatarUploadError()));
          return;
        }
        settle(() => resolve({ bytesWritten }));
      })();
    });

    request.pipe(parser);
  });
}
