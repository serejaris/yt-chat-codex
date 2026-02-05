import { io, type Socket } from "socket.io-client";

import { WS_BASE_URL } from "./config";

export interface ServerToClientEvents {
  "chat:new": (payload: { id: number; username: string; text: string; createdAt: string }) => void;
  "chat:rate_limited": (payload: { retryAfterMs: number }) => void;
  "presence:update": (payload: { users: string[] }) => void;
  "chat:error": (payload: { code: string; message: string }) => void;
}

export interface ClientToServerEvents {
  "chat:send": (payload: { text: string; clientMessageId?: string }) => void;
}

export type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createChatSocket(token: string): ChatSocket {
  return io(WS_BASE_URL, {
    transports: ["websocket"],
    auth: { token }
  });
}
