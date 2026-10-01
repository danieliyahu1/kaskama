import { lazy, Suspense, useEffect, useState } from "react";
import {
  MEDIA_CATEGORY_LABELS,
  mediaCategory,
  type PostResponse,
} from "@kaskama/shared";
import { MediaPlayer } from "./MediaPlayer.js";
import { Spinner } from "./Spinner.js";

/**
 * The PDF renderer is large and most posts are not documents, so it loads only
 * when a document is actually opened.
 */
const PdfViewer = lazy(() =>
  import("./PdfViewer.js").then((module) => ({ default: module.PdfViewer })),
);

export function PostMedia({ post }: { post: PostResponse }) {
  const [mediaError, setMediaError] = useState(false);
  const category = mediaCategory(post.mediaType);
  const mediaLabel =
    post.caption || (category ? MEDIA_CATEGORY_LABELS[category] : "Media");
  const mediaUrl = `/api/posts/${encodeURIComponent(post.id)}/media`;

  useEffect(() => {
    setMediaError(false);
  }, [post.id]);

  if (mediaError) {
    return (
      <p className="feedback inline" role="alert">
        This media isn&apos;t available right now.
      </p>
    );
  }

  switch (category) {
    case "video":
    case "audio":
      return (
        <MediaPlayer
          src={mediaUrl}
          label={mediaLabel}
          kind={category}
          onError={() => setMediaError(true)}
        />
      );
    case "document":
      return (
        <Suspense
          fallback={
            <div className="pdf-reader">
              <p className="pdf-status" role="status">
                <Spinner />
              </p>
            </div>
          }
        >
          <PdfViewer src={mediaUrl} title={mediaLabel} />
        </Suspense>
      );
    default:
      return (
        <img
          className="post-media"
          src={mediaUrl}
          alt={mediaLabel}
          onError={() => setMediaError(true)}
        />
      );
  }
}
