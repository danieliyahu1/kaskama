import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { MediaType } from "@kaskama/shared";
import { MediaTypeBadge } from "./MediaTypeBadge.js";

export function PostTile({
  media,
  caption,
  date,
  to,
  mediaType,
  action,
}: {
  media: ReactNode;
  caption: string;
  date?: string | undefined;
  to?: string | undefined;
  mediaType?: MediaType | undefined;
  action?: ReactNode;
}) {
  return (
    <article className="post-tile">
      {media}
      <div className="post-tile-copy">
        {to ? (
          <Link className="post-tile-caption" to={to}>
            {caption}
          </Link>
        ) : (
          <p className="post-tile-caption">{caption}</p>
        )}
        <div className="post-tile-meta">
          {mediaType ? <MediaTypeBadge mediaType={mediaType} to={to} /> : null}
          {date ? <span className="post-tile-date">{date}</span> : null}
        </div>
      </div>
      {action}
    </article>
  );
}

export function PostTileMedia({ children }: { children?: ReactNode }) {
  return <div className="post-tile-media">{children}</div>;
}

export function PostTileAction({ children }: { children: ReactNode }) {
  return <div className="post-tile-action">{children}</div>;
}
