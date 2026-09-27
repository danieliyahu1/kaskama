/**
 * Fire-and-forget notice that the publish button was clicked. Recording the
 * click is best-effort: a failed beacon must never disrupt publishing, so the
 * response is ignored and errors are dropped.
 */
export function trackPublishClick(): void {
  void fetch("/api/analytics/publish-click", {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => {});
}
