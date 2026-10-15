import { Message } from "./Message.js";
import { Spinner } from "./Spinner.js";

/**
 * The one sign-in gate for a surface that needs a wallet. Every page that owns
 * one says so the same way, so signing in reads the same everywhere.
 */
export function SignInRequired({
  title,
  signIn,
  signingIn,
}: {
  title: string;
  signIn: () => Promise<string | null>;
  signingIn: boolean;
}) {
  return (
    <Message title={title}>
      <button className="primary" disabled={signingIn} onClick={() => void signIn()}>
        {signingIn && <Spinner />}
        {signingIn ? "Signing in..." : "Sign in"}
      </button>
    </Message>
  );
}
