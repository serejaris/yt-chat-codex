import { FormEvent, useState } from "react";

interface LoginFormProps {
  onSubmit: (username: string) => Promise<void>;
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit(username);
      setUsername("");
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Unable to login";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="card login-card">
      <h1>Realtime Chat</h1>
      <p className="subtitle">Enter a name to join the shared room.</p>

      <form onSubmit={handleSubmit} className="login-form">
        <label htmlFor="username">Username</label>
        <input
          id="username"
          autoComplete="off"
          minLength={3}
          maxLength={20}
          pattern="[A-Za-z0-9_]+"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="e.g. alex_42"
          required
        />

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Joining..." : "Join chat"}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
