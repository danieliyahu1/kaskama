import { Link } from "react-router-dom";
import { MEDIA_CATEGORY_LABELS, mediaCategory, type MediaType } from "@kaskama/shared";
import { MediaIcon, type MediaIconKind } from "./Icons.js";

export function mediaIconKind(mediaType: MediaType): MediaIconKind {
  return mediaCategory(mediaType) ?? "media";
}

export function MediaTypeBadge({
  mediaType,
  to,
}: {
  mediaType: MediaType;
  to?: string | undefined;
}) {
  const kind = mediaIconKind(mediaType);
  const icon = <MediaIcon kind={kind} />;
  const label = kind === "media" ? "Media" : MEDIA_CATEGORY_LABELS[kind];

  if (to) {
    return (
      <Link className="media-type-badge" to={to} aria-label={label}>
        {icon}
      </Link>
    );
  }

  return (
    <span className="media-type-badge" role="img" aria-label={label}>
      {icon}
    </span>
  );
}
