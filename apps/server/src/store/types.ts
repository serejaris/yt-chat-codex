import type { ChatMessage } from "@yt-chat/shared";

export interface SessionData {
  username: string;
  normalizedUsername: string;
}

export interface ChatStore {
  reserveUsername(
    normalizedUsername: string,
    username: string,
    sessionId: string,
    ttlSec: number
  ): Promise<boolean>;
  touchUsername(normalizedUsername: string, sessionId: string, ttlSec: number): Promise<boolean>;
  releaseUsername(normalizedUsername: string, sessionId: string): Promise<void>;
  listOnlineUsers(): Promise<string[]>;

  setSession(sessionId: string, data: SessionData, ttlSec: number): Promise<void>;
  getSession(sessionId: string): Promise<SessionData | null>;
  deleteSession(sessionId: string): Promise<void>;

  incrementRateLimit(normalizedUsername: string, windowStartSec: number, windowSec: number): Promise<number>;

  nextMessageId(): Promise<number>;
  pushMessage(message: ChatMessage, limit: number): Promise<void>;
  getMessages(limit: number): Promise<ChatMessage[]>;
}
