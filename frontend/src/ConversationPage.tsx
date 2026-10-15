import { useEffect, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  MAX_CHAT_MESSAGE_LENGTH,
  type ChatConversationResponse,
} from "@kaskama/shared";
import { readConversation, sendMessage } from "./chat.js";
import { CreatorAvatar } from "./CreatorAvatar.js";
import { Spinner } from "./Spinner.js";
import { HomeLink, Message } from "./Message.js";
import { COPY } from "./copy.js";
import { errorText } from "./errors.js";
import { compactAddress } from "./format.js";
import { SignInRequired } from "./SignInRequired.js";
import { useToast } from "./Toast.js";
import { checkoutPath } from "./creator-url.js";
import type { WalletProps } from "./wallet.js";

/** One conversation, with the composer that the subscription gate can replace. */
export function ConversationPage({ address, signIn, signingIn }: WalletProps) {
  const { address: counterpart = "" } = useParams();
  const [conversation, setConversation] = useState<ChatConversationResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const { showToast, dismissToast } = useToast();

  useEffect(() => {
    if (!address) return;
    let active = true;
    setConversation(null);
    setError(null);
    void readConversation(counterpart)
      .then((value) => {
        if (active) setConversation(value);
      })
      .catch((caught: unknown) => {
        if (active) setError(errorText(caught, COPY.conversationFailed));
      });
    return () => {
      active = false;
    };
  }, [address, counterpart]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || sending || !conversation?.canSend) return;
    setSending(true);
    dismissToast();
    try {
      const message = await sendMessage(counterpart, body);
      setConversation((previous) =>
        previous
          ? { ...previous, messages: [...previous.messages, message] }
          : previous,
      );
      setDraft("");
    } catch (caught) {
      showToast(errorText(caught, COPY.messageFailed), "error");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  if (!address)
    return (
      <SignInRequired
        title={COPY.conversationSignIn}
        signIn={signIn}
        signingIn={signingIn}
      />
    );
  if (error)
    return (
      <Message title={error}>
        <HomeLink />
      </Message>
    );
  if (!conversation)
    return (
      <Message title="Loading..." center>
        <Spinner />
      </Message>
    );

  const name = conversation.displayName ?? compactAddress(counterpart);

  return (
    <section className="conversation">
      <header className="conversation-head">
        <Link
          className="conversation-back"
          to="/messages"
          aria-label="Back to messages"
        >
          ‹
        </Link>
        <CreatorAvatar avatarUrl={conversation.avatarUrl} />
        <h1 className="conversation-name">{name}</h1>
      </header>
      <ol className="conversation-messages">
        {conversation.messages.map((message) => (
          <li key={message.id} className={message.mine ? "bubble is-mine" : "bubble"}>
            {message.body}
          </li>
        ))}
      </ol>
      {conversation.canSend ? (
        <form className="composer" onSubmit={(event) => void submit(event)}>
          <textarea
            className="composer-input"
            aria-label={COPY.messagePlaceholder}
            placeholder={COPY.messagePlaceholder}
            value={draft}
            rows={1}
            maxLength={MAX_CHAT_MESSAGE_LENGTH}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <button className="primary" type="submit" disabled={!draft.trim() || sending}>
            {sending && <Spinner />}
            {COPY.messageSend}
          </button>
        </form>
      ) : (
        <div className="composer is-gated">
          <p className="composer-gate">
            {COPY.subscribeToMessage.replace("{name}", name)}
          </p>
          <Link className="primary" to={checkoutPath(counterpart)}>
            Subscribe
          </Link>
        </div>
      )}
    </section>
  );
}
