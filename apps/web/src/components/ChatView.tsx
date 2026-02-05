import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import type { ChatMessage } from "@yt-chat/shared";

import { fetchHistory, logout } from "../lib/api";
import { clearStoredToken } from "../lib/auth";
import { createChatSocket, type ChatSocket } from "../lib/socket";

interface ChatViewProps {
  token: string;
  onSignedOut: () => void;
}

export function ChatView({ token, onSignedOut }: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [status, setStatus] = useState("Connecting...");

  const socketRef = useRef<ChatSocket | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const retryAfterSeconds = useMemo(() => {
    if (!rateLimitedUntil) {
      return 0;
    }

    return Math.max(Math.ceil((rateLimitedUntil - Date.now()) / 1000), 0);
  }, [rateLimitedUntil]);

  useEffect(() => {
    if (retryAfterSeconds === 0 && rateLimitedUntil) {
      setRateLimitedUntil(null);
    }
  }, [retryAfterSeconds, rateLimitedUntil]);

  useEffect(() => {
    let alive = true;

    fetchHistory(token)
      .then((history) => {
        if (alive) {
          setMessages(history);
        }
      })
      .catch((historyError) => {
        if (!alive) {
          return;
        }

        const message = historyError instanceof Error ? historyError.message : "Unable to load history";
        setError(message);
      });

    const socket = createChatSocket(token);
    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("Connected");
    });

    socket.on("disconnect", () => {
      setStatus("Disconnected");
    });

    socket.on("chat:new", (message) => {
      setMessages((previous) => [...previous, message]);
      requestAnimationFrame(() => {
        if (listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight;
        }
      });
    });

    socket.on("presence:update", ({ users }) => {
      setOnlineUsers(users);
    });

    socket.on("chat:rate_limited", ({ retryAfterMs }) => {
      setRateLimitedUntil(Date.now() + retryAfterMs);
    });

    socket.on("chat:error", ({ message }) => {
      setError(message);
    });

    socket.on("connect_error", () => {
      setError("Session expired. Please log in again.");
      clearStoredToken();
      onSignedOut();
    });

    return () => {
      alive = false;
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, onSignedOut]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  async function handleLogout() {
    try {
      await logout(token);
    } finally {
      clearStoredToken();
      onSignedOut();
    }
  }

  function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft.trim() || retryAfterSeconds > 0) {
      return;
    }

    socketRef.current?.emit("chat:send", { text: draft });
    setDraft("");
  }

  return (
    <section className="chat-layout">
      <aside className="card sidebar">
        <h2>Online</h2>
        <p className="status">{status}</p>
        <ul>
          {onlineUsers.map((user) => (
            <li key={user}>{user}</li>
          ))}
        </ul>
        <button onClick={handleLogout} className="secondary">
          Sign out
        </button>
      </aside>

      <main className="card chat-card">
        <header>
          <h2>Global room</h2>
          <p className="subtitle">Rate limit: 5 messages / 10 seconds</p>
        </header>

        <div className="messages" ref={listRef}>
          {messages.map((message) => (
            <article key={message.id} className="message">
              <p>
                <strong>{message.username}</strong>
                <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
              </p>
              <p>{message.text}</p>
            </article>
          ))}
        </div>

        <form onSubmit={handleSend} className="composer">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Write a message"
            maxLength={500}
          />
          <button type="submit" disabled={!draft.trim() || retryAfterSeconds > 0}>
            Send
          </button>
        </form>

        {retryAfterSeconds > 0 ? (
          <p className="warning">Rate limited. Try again in {retryAfterSeconds}s.</p>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
      </main>
    </section>
  );
}
