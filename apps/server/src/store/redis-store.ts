import type { ChatMessage } from "@yt-chat/shared";
import type { Redis } from "ioredis";

import type { ChatStore, SessionData } from "./types";

const PRESENCE_MEMBERS_KEY = "presence:usernames";
const MESSAGES_KEY = "chat:messages";
const MESSAGE_SEQ_KEY = "chat:seq";

function presenceKey(normalizedUsername: string): string {
  return `presence:username:${normalizedUsername}`;
}

function sessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

function rateKey(normalizedUsername: string, windowStartSec: number): string {
  return `rate:user:${normalizedUsername}:${windowStartSec}`;
}

function buildPresenceValue(sessionId: string, username: string): string {
  return `${sessionId}:${username}`;
}

function parsePresenceValue(value: string): { sessionId: string; username: string } | null {
  const splitIndex = value.indexOf(":");
  if (splitIndex < 1 || splitIndex === value.length - 1) {
    return null;
  }

  return {
    sessionId: value.slice(0, splitIndex),
    username: value.slice(splitIndex + 1)
  };
}

export class RedisChatStore implements ChatStore {
  constructor(private readonly redis: Redis) {}

  async reserveUsername(
    normalizedUsername: string,
    username: string,
    sessionId: string,
    ttlSec: number
  ): Promise<boolean> {
    const result = await this.redis.set(
      presenceKey(normalizedUsername),
      buildPresenceValue(sessionId, username),
      "EX",
      ttlSec,
      "NX"
    );

    if (result === "OK") {
      await this.redis.sadd(PRESENCE_MEMBERS_KEY, normalizedUsername);
      return true;
    }

    return false;
  }

  async touchUsername(normalizedUsername: string, sessionId: string, ttlSec: number): Promise<boolean> {
    const raw = await this.redis.get(presenceKey(normalizedUsername));

    if (!raw) {
      return false;
    }

    const parsed = parsePresenceValue(raw);
    if (!parsed || parsed.sessionId !== sessionId) {
      return false;
    }

    await this.redis.expire(presenceKey(normalizedUsername), ttlSec);
    return true;
  }

  async releaseUsername(normalizedUsername: string, sessionId: string): Promise<void> {
    const key = presenceKey(normalizedUsername);
    const raw = await this.redis.get(key);

    if (!raw) {
      await this.redis.srem(PRESENCE_MEMBERS_KEY, normalizedUsername);
      return;
    }

    const parsed = parsePresenceValue(raw);
    if (!parsed || parsed.sessionId !== sessionId) {
      return;
    }

    await this.redis.multi().del(key).srem(PRESENCE_MEMBERS_KEY, normalizedUsername).exec();
  }

  async listOnlineUsers(): Promise<string[]> {
    const normalizedUsernames = await this.redis.smembers(PRESENCE_MEMBERS_KEY);
    if (normalizedUsernames.length === 0) {
      return [];
    }

    const pipeline = this.redis.pipeline();
    for (const normalized of normalizedUsernames) {
      pipeline.get(presenceKey(normalized));
    }

    const results = await pipeline.exec();

    const users: string[] = [];
    const stale: string[] = [];

    for (let index = 0; index < normalizedUsernames.length; index += 1) {
      const normalized = normalizedUsernames[index];
      if (!normalized) {
        continue;
      }
      const raw = results?.[index]?.[1];

      if (typeof raw !== "string") {
        stale.push(normalized);
        continue;
      }

      const parsed = parsePresenceValue(raw);
      if (!parsed) {
        stale.push(normalized);
        continue;
      }

      users.push(parsed.username);
    }

    if (stale.length > 0) {
      await this.redis.srem(PRESENCE_MEMBERS_KEY, ...stale);
    }

    return users.sort((a, b) => a.localeCompare(b));
  }

  async setSession(sessionId: string, data: SessionData, ttlSec: number): Promise<void> {
    await this.redis.set(sessionKey(sessionId), JSON.stringify(data), "EX", ttlSec);
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    const raw = await this.redis.get(sessionKey(sessionId));
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as SessionData;
      if (!parsed.username || !parsed.normalizedUsername) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.redis.del(sessionKey(sessionId));
  }

  async incrementRateLimit(normalizedUsername: string, windowStartSec: number, windowSec: number): Promise<number> {
    const key = rateKey(normalizedUsername, windowStartSec);
    const results = await this.redis.multi().incr(key).expire(key, windowSec).exec();
    const count = results?.[0]?.[1];

    if (typeof count !== "number") {
      throw new Error("Failed to increment rate limit counter");
    }

    return count;
  }

  async nextMessageId(): Promise<number> {
    return this.redis.incr(MESSAGE_SEQ_KEY);
  }

  async pushMessage(message: ChatMessage, limit: number): Promise<void> {
    await this.redis
      .multi()
      .lpush(MESSAGES_KEY, JSON.stringify(message))
      .ltrim(MESSAGES_KEY, 0, Math.max(limit - 1, 0))
      .exec();
  }

  async getMessages(limit: number): Promise<ChatMessage[]> {
    const rawMessages = await this.redis.lrange(MESSAGES_KEY, 0, Math.max(limit - 1, 0));

    const parsedMessages = rawMessages.flatMap((rawMessage) => {
      try {
        return [JSON.parse(rawMessage) as ChatMessage];
      } catch {
        return [];
      }
    });

    return parsedMessages.reverse();
  }
}
