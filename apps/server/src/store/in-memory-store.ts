import type { ChatMessage } from "@yt-chat/shared";

import type { ChatStore, SessionData } from "./types";

interface PresenceEntry {
  sessionId: string;
  username: string;
  expiresAt: number;
}

interface SessionEntry {
  data: SessionData;
  expiresAt: number;
}

interface RateEntry {
  count: number;
  expiresAt: number;
}

export class InMemoryChatStore implements ChatStore {
  private readonly presence = new Map<string, PresenceEntry>();
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly rate = new Map<string, RateEntry>();
  private readonly messages: ChatMessage[] = [];
  private seq = 0;

  constructor(private readonly now: () => number = () => Date.now()) {}

  async reserveUsername(
    normalizedUsername: string,
    username: string,
    sessionId: string,
    ttlSec: number
  ): Promise<boolean> {
    this.cleanupPresence();

    if (this.presence.has(normalizedUsername)) {
      return false;
    }

    this.presence.set(normalizedUsername, {
      sessionId,
      username,
      expiresAt: this.now() + ttlSec * 1000
    });

    return true;
  }

  async touchUsername(normalizedUsername: string, sessionId: string, ttlSec: number): Promise<boolean> {
    this.cleanupPresence();
    const entry = this.presence.get(normalizedUsername);

    if (!entry || entry.sessionId !== sessionId) {
      return false;
    }

    entry.expiresAt = this.now() + ttlSec * 1000;
    return true;
  }

  async releaseUsername(normalizedUsername: string, sessionId: string): Promise<void> {
    this.cleanupPresence();
    const entry = this.presence.get(normalizedUsername);

    if (entry && entry.sessionId === sessionId) {
      this.presence.delete(normalizedUsername);
    }
  }

  async listOnlineUsers(): Promise<string[]> {
    this.cleanupPresence();
    return Array.from(this.presence.values())
      .map((entry) => entry.username)
      .sort((a, b) => a.localeCompare(b));
  }

  async setSession(sessionId: string, data: SessionData, ttlSec: number): Promise<void> {
    this.sessions.set(sessionId, {
      data,
      expiresAt: this.now() + ttlSec * 1000
    });
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    this.cleanupSessions();
    return this.sessions.get(sessionId)?.data ?? null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async incrementRateLimit(normalizedUsername: string, windowStartSec: number, windowSec: number): Promise<number> {
    this.cleanupRateLimit();
    const key = `${normalizedUsername}:${windowStartSec}`;
    const entry = this.rate.get(key);

    if (!entry) {
      this.rate.set(key, {
        count: 1,
        expiresAt: this.now() + windowSec * 1000
      });
      return 1;
    }

    entry.count += 1;
    return entry.count;
  }

  async nextMessageId(): Promise<number> {
    this.seq += 1;
    return this.seq;
  }

  async pushMessage(message: ChatMessage, limit: number): Promise<void> {
    this.messages.unshift(message);
    if (this.messages.length > limit) {
      this.messages.length = limit;
    }
  }

  async getMessages(limit: number): Promise<ChatMessage[]> {
    const newestFirst = this.messages.slice(0, limit);
    return newestFirst.reverse();
  }

  private cleanupPresence(): void {
    const now = this.now();
    for (const [key, entry] of this.presence.entries()) {
      if (entry.expiresAt <= now) {
        this.presence.delete(key);
      }
    }
  }

  private cleanupSessions(): void {
    const now = this.now();
    for (const [key, entry] of this.sessions.entries()) {
      if (entry.expiresAt <= now) {
        this.sessions.delete(key);
      }
    }
  }

  private cleanupRateLimit(): void {
    const now = this.now();
    for (const [key, entry] of this.rate.entries()) {
      if (entry.expiresAt <= now) {
        this.rate.delete(key);
      }
    }
  }
}
