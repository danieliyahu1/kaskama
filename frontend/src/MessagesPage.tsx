import { useState } from "react";
import { Link } from "react-router-dom";
import type { ChatThreadSummary } from "@kaskama/shared";
import { conversationPath, listThreads } from "./chat.js";
import { CreatorAvatar } from "./CreatorAvatar.js";
import { Spinner } from "./Spinner.js";
import { HomeLink, Message } from "./Message.js";
import { COPY } from "./copy.js";
import { errorText } from "./errors.js";
import { compactAddress, relativeTime } from "./format.js";
import { useAsyncResource } from "./useAsyncResource.js";
import { SignInRequired } from "./SignInRequired.js";
import type { WalletProps } from "./wallet.js";

/** Every conversation a wallet takes part in, whoever its creators and fans are. */
export function MessagesPage({ address, signIn, signingIn }: WalletProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const { data: threads, loading, error } = useAsyncResource(
    (signal) =>
      address ? listThreads(signal) : Promise.resolve<ChatThreadSummary[]>([]),
    [address, reloadKey],
  );

  if (!address)
    return (
      <SignInRequired
        title={COPY.messagesSignIn}
        signIn={signIn}
        signingIn={signingIn}
      />
    );
  if (error)
    return (
      <Message title={errorText(error, COPY.messagesFailed)}>
        <button
          className="secondary"
          type="button"
          onClick={() => setReloadKey((key) => key + 1)}
        >
          Try again
        </button>
        <HomeLink />
      </Message>
    );
  if (loading || !threads)
    return (
      <Message title="Loading..." center>
        <Spinner />
      </Message>
    );

  return (
    <section className="messages">
      <h1 className="messages-title">Messages</h1>
      {threads.length ? (
        <ul className="thread-list">
          {threads.map((thread) => (
            <li key={thread.address}>
              <Link className="thread" to={conversationPath(thread.address)}>
                <CreatorAvatar avatarUrl={thread.avatarUrl} />
                <span className="thread-body">
                  <span className="thread-name">
                    {thread.displayName ?? compactAddress(thread.address)}
                  </span>
                  {thread.lastMessage && (
                    <span className="thread-preview">{thread.lastMessage}</span>
                  )}
                </span>
                <span className="thread-meta">
                  {thread.lastMessageAt && (
                    <time className="thread-time" dateTime={thread.lastMessageAt}>
                      {relativeTime(thread.lastMessageAt)}
                    </time>
                  )}
                  {thread.unread > 0 && (
                    <span
                      className="thread-unread"
                      role="img"
                      aria-label={`${thread.unread} unread`}
                    />
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="messages-empty">{COPY.messagesEmpty}</p>
      )}
    </section>
  );
}
