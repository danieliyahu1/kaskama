import type { ChatMessage, ChatThread } from "../domain/models.js";
import type { ChatRepository } from "./ports.js";
import type { MembershipAccess } from "./membership-access.js";

/** How much of a conversation is read at once. Threads are small; this bounds them. */
const MESSAGE_WINDOW = 200;

export interface ChatInboxEntry {
  /** The other participant. */
  counterpart: string;
  counterpartIsCreator: boolean;
  lastMessage: string | null;
  lastMessageAt: number;
  unread: number;
}

export interface ChatConversationView {
  counterpart: string;
  counterpartIsCreator: boolean;
  /** Whether the subscription gate lets this wallet write right now. */
  canSend: boolean;
  messages: ChatMessage[];
}

export type ChatConversationResult =
  { kind: "READY"; conversation: ChatConversationView } | { kind: "SELF" };

export type ChatSendResult =
  | { kind: "SENT"; message: ChatMessage }
  | { kind: "SUBSCRIBE" }
  | { kind: "NOT_FOUND" };

/**
 * Conversations between a creator and their subscribers. Off chain: the wallet
 * that buys is the wallet that talks. A wallet may always read a thread it is
 * part of; writing is gated on a live subscription, so a lapsed reader keeps
 * their history and pays to reply.
 */
export class ChatService {
  constructor(
    private readonly chats: ChatRepository,
    private readonly membership: MembershipAccess,
    private readonly createId: () => string,
    private readonly now: () => number,
  ) {}

  async inbox(viewer: string): Promise<ChatInboxEntry[]> {
    const threads = await this.chats.chatThreadsFor(viewer);
    if (!threads.length) return [];
    const [lastMessages, unread] = await Promise.all([
      this.chats.chatLastMessages(threads.map((thread) => thread.id)),
      this.chats.chatUnreadCounts(viewer),
    ]);
    const lastByThread = new Map(
      lastMessages.map((message) => [message.threadId, message]),
    );
    return threads.map((thread) => {
      const viewerIsCreator = thread.creator === viewer;
      const last = lastByThread.get(thread.id);
      return {
        counterpart: viewerIsCreator ? thread.fan : thread.creator,
        counterpartIsCreator: !viewerIsCreator,
        lastMessage: last?.body ?? null,
        lastMessageAt: thread.lastMessageAt,
        unread: unread.get(thread.id) ?? 0,
      };
    });
  }

  /**
   * Opens a conversation and marks the messages it received as read. The read
   * is part of opening, not a separate step: the screen that shows the history
   * is the one that consumes it. Named for the action, not a query that secretly
   * writes.
   */
  async openConversation(
    viewer: string,
    address: string,
  ): Promise<ChatConversationResult> {
    if (address === viewer) return { kind: "SELF" };
    const thread = await this.threadWith(viewer, address);
    if (!thread) {
      return {
        kind: "READY",
        conversation: {
          counterpart: address,
          counterpartIsCreator: true,
          canSend: await this.membership.isActive(viewer, address),
          messages: [],
        },
      };
    }
    const viewerIsCreator = thread.creator === viewer;
    const messages = await this.chats.chatMessages(thread.id, MESSAGE_WINDOW);
    await this.chats.markChatRead(thread.id, viewer, this.now());
    return {
      kind: "READY",
      conversation: {
        counterpart: address,
        counterpartIsCreator: !viewerIsCreator,
        canSend: viewerIsCreator || (await this.membership.isActive(viewer, address)),
        messages,
      },
    };
  }

  async send(viewer: string, address: string, body: string): Promise<ChatSendResult> {
    if (address === viewer) return { kind: "NOT_FOUND" };
    const existing = await this.threadWith(viewer, address);
    const thread = existing ?? (await this.startThread(viewer, address));
    if (!thread) return { kind: "SUBSCRIBE" };

    const viewerIsCreator = thread.creator === viewer;
    if (!viewerIsCreator && !(await this.membership.isActive(viewer, thread.creator))) {
      return { kind: "SUBSCRIBE" };
    }

    const message: ChatMessage = {
      id: this.createId(),
      threadId: thread.id,
      sender: viewer,
      body,
      sentAt: this.now(),
      readAt: null,
    };
    await this.chats.appendChatMessage(message);
    return { kind: "SENT", message };
  }

  /** The thread the viewer shares with an address, in either direction. */
  private async threadWith(
    viewer: string,
    address: string,
  ): Promise<ChatThread | null> {
    return (
      (await this.chats.findChatThread(address, viewer)) ??
      (await this.chats.findChatThread(viewer, address))
    );
  }

  /**
   * Opens a thread for a subscriber, or returns null when the viewer is not the
   * fan this address would subscribe to. A creator never starts a thread; they
   * reply inside one, so a wallet with no history and no subscription is refused.
   */
  private async startThread(
    viewer: string,
    address: string,
  ): Promise<ChatThread | null> {
    if (!(await this.membership.isActive(viewer, address))) return null;
    const at = this.now();
    const thread: ChatThread = {
      id: this.createId(),
      creator: address,
      fan: viewer,
      createdAt: at,
      lastMessageAt: at,
    };
    const outcome = await this.chats.createChatThread(thread);
    if (outcome === "CREATED") return thread;
    // A concurrent open won the race; use the row that already exists.
    const existing = await this.chats.findChatThread(address, viewer);
    if (!existing) throw new Error("CHAT_THREAD_LOST");
    return existing;
  }
}
