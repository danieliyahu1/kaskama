import type {
  ChatConversationResponse,
  ChatMessageResponse,
  ChatThreadSummary,
} from "@kaskama/shared";
import { api } from "./kasware.js";

/** The Messages list, newest conversation first. */
export async function listThreads(signal?: AbortSignal): Promise<ChatThreadSummary[]> {
  const body = await api<{ threads: ChatThreadSummary[] }>(
    "/api/chat/threads",
    signal ? { signal } : {},
  );
  return body.threads;
}

/** Opens a conversation with one address, marking it read. */
export function readConversation(
  address: string,
  signal?: AbortSignal,
): Promise<ChatConversationResponse> {
  return api<ChatConversationResponse>(
    conversationApiPath(address),
    signal ? { signal } : {},
  );
}

export function sendMessage(
  address: string,
  body: string,
): Promise<ChatMessageResponse> {
  return api<ChatMessageResponse>(`${conversationApiPath(address)}/messages`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

/** The route for a conversation with one address. */
export function conversationPath(address: string): string {
  return `/messages/${encodeURIComponent(address)}`;
}

function conversationApiPath(address: string): string {
  return `/api/chat/threads/${encodeURIComponent(address)}`;
}
