export function shortenAddress(address: string): string {
  return `${address.slice(0, 16)}...${address.slice(-8)}`;
}

/**
 * A quiet, network-prefix-free form of a wallet address for a card: enough to
 * tell two identically-named creators apart, short enough to never wrap.
 */
export function compactAddress(address: string): string {
  const body = address.replace(/^[^:]*:/, "");
  return body.length <= 12 ? body : `${body.slice(0, 6)}…${body.slice(-4)}`;
}

export function formatKas(sompi: string): string {
  const padded = BigInt(sompi).toString().padStart(9, "0");
  return `${padded.slice(0, -8)}.${padded.slice(-8)}`.replace(/\.?0+$/, "");
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}

export function relativeTime(iso: string, now = Date.now()): string {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "";
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

/**
 * The same age read as a phrase: "2d ago", or "just now" on its own, which
 * already reads as one. The single way a lone post age is phrased.
 */
export function relativeTimeAgo(iso: string, now = Date.now()): string {
  const relative = relativeTime(iso, now);
  if (relative === "") return "";
  return relative === "just now" ? relative : `${relative} ago`;
}
