import { useEffect, useState } from "react";
import { isAudioMedia, isVideoMedia, type PostResponse } from "@kaskama/shared";
import { MediaPlayer } from "./MediaPlayer.js";

export function PostMedia({ post }: { post: PostResponse }) {
  const [mediaError, setMediaError] = useState(false);
  const isVideo = isVideoMedia(post.mediaType);
  const isAudio = isAudioMedia(post.mediaType);
  const mediaLabel =
    post.caption || (isVideo ? "Video" : isAudio ? "Audio" : "Photo");
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

  return isVideo || isAudio ? (
    <MediaPlayer
      src={mediaUrl}
      label={mediaLabel}
      kind={isVideo ? "video" : "audio"}
      onError={() => setMediaError(true)}
    />
  ) : (
    <img
      className="post-media"
      src={mediaUrl}
      alt={mediaLabel}
      onError={() => setMediaError(true)}
    />
  );
}
