import { randomUUID } from "node:crypto";

import { chatSendSchema, loginRequestSchema, normalizeUsername, type ChatMessage } from "@yt-chat/shared";
import cors from "@fastify/cors";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { Server, type Socket } from "socket.io";
import { z } from "zod";

import type { AppConfig } from "./config";
import { calculateRateLimitWindow } from "./rate-limit/window";
import type { ChatStore } from "./store/types";
import { signAuthToken, verifyAuthToken, type AuthTokenPayload } from "./utils/jwt";

interface CreateAppOptions {
  config: AppConfig;
  store: ChatStore;
  now?: () => number;
}

interface AuthContext {
  sessionId: string;
  username: string;
  normalizedUsername: string;
}

interface ServerToClientEvents {
  "chat:new": (message: ChatMessage) => void;
  "chat:rate_limited": (payload: { retryAfterMs: number }) => void;
  "presence:update": (payload: { users: string[] }) => void;
  "chat:error": (payload: { code: string; message: string }) => void;
}

interface ClientToServerEvents {
  "chat:send": (payload: unknown) => void;
}

interface SocketData {
  auth: AuthContext;
}

type ChatSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

function extractBearerToken(authorizationHeader?: string): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token;
}

async function broadcastPresence(io: Server<ClientToServerEvents, ServerToClientEvents>, store: ChatStore): Promise<void> {
  const users = await store.listOnlineUsers();
  io.emit("presence:update", { users });
}

export async function createApp({ config, store, now = () => Date.now() }: CreateAppOptions) {
  const app = Fastify({
    logger: config.nodeEnv !== "test"
  });

  const corsOrigin = config.corsOrigin === "*" ? true : config.corsOrigin;

  await app.register(cors, {
    origin: corsOrigin,
    credentials: true
  });

  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(app.server, {
    cors: {
      origin: corsOrigin,
      credentials: true
    }
  });

  const sessionSocketCounts = new Map<string, number>();

  async function authenticateToken(token: string | null): Promise<AuthContext | null> {
    if (!token) {
      return null;
    }

    let authPayload: AuthTokenPayload;
    try {
      authPayload = verifyAuthToken(token, config.jwtSecret);
    } catch {
      return null;
    }

    const sessionData = await store.getSession(authPayload.sessionId);
    if (!sessionData) {
      return null;
    }

    if (sessionData.normalizedUsername !== authPayload.normalizedUsername) {
      return null;
    }

    return {
      sessionId: authPayload.sessionId,
      username: sessionData.username,
      normalizedUsername: sessionData.normalizedUsername
    };
  }

  async function requireHttpAuth(request: FastifyRequest, reply: FastifyReply): Promise<AuthContext | null> {
    const token = extractBearerToken(request.headers.authorization);
    const auth = await authenticateToken(token);

    if (!auth) {
      await reply.code(401).send({ code: "UNAUTHORIZED", message: "Invalid or missing token" });
      return null;
    }

    return auth;
  }

  app.get("/healthz", async () => ({ ok: true }));

  app.post("/auth/login", async (request, reply) => {
    const parsedBody = loginRequestSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.code(422).send({
        code: "INVALID_USERNAME",
        message: "Username must be 3-20 chars and contain only letters, numbers, underscore"
      });
    }

    const username = parsedBody.data.username.trim();
    const normalizedUsername = normalizeUsername(username);
    const sessionId = randomUUID();

    const reserved = await store.reserveUsername(
      normalizedUsername,
      username,
      sessionId,
      config.presenceTtlSec
    );

    if (!reserved) {
      return reply.code(409).send({
        code: "USERNAME_TAKEN",
        message: "Username is already online"
      });
    }

    await store.setSession(
      sessionId,
      {
        username,
        normalizedUsername
      },
      config.sessionTtlSec
    );

    const token = signAuthToken(
      {
        sessionId,
        username,
        normalizedUsername
      },
      config.jwtSecret,
      config.jwtExpiresIn
    );

    await broadcastPresence(io, store);

    return reply.code(200).send({
      token,
      username,
      expiresIn: config.jwtExpiresIn
    });
  });

  app.post("/auth/logout", async (request, reply) => {
    const auth = await requireHttpAuth(request, reply);
    if (!auth) {
      return;
    }

    await store.deleteSession(auth.sessionId);
    await store.releaseUsername(auth.normalizedUsername, auth.sessionId);
    await broadcastPresence(io, store);

    return reply.code(204).send();
  });

  app.get("/chat/history", async (request, reply) => {
    const auth = await requireHttpAuth(request, reply);
    if (!auth) {
      return;
    }

    const parsedQuery = historyQuerySchema.safeParse(request.query ?? {});

    if (!parsedQuery.success) {
      return reply.code(422).send({
        code: "INVALID_QUERY",
        message: "Invalid query parameters"
      });
    }

    const effectiveLimit = Math.min(parsedQuery.data.limit, config.messageHistoryLimit);
    const messages = await store.getMessages(effectiveLimit);

    return reply.code(200).send({ messages });
  });

  io.use(async (socket, next) => {
    try {
      const authToken =
        typeof socket.handshake.auth.token === "string"
          ? socket.handshake.auth.token
          : extractBearerToken(socket.handshake.headers.authorization);

      const auth = await authenticateToken(authToken);

      if (!auth) {
        next(new Error("UNAUTHORIZED"));
        return;
      }

      const touched = await store.touchUsername(auth.normalizedUsername, auth.sessionId, config.presenceTtlSec);
      if (!touched) {
        const reserved = await store.reserveUsername(
          auth.normalizedUsername,
          auth.username,
          auth.sessionId,
          config.presenceTtlSec
        );

        if (!reserved) {
          next(new Error("USERNAME_TAKEN"));
          return;
        }
      }

      socket.data.auth = auth;
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", async (socket: ChatSocket) => {
    const { auth } = socket.data;

    const currentCount = sessionSocketCounts.get(auth.sessionId) ?? 0;
    sessionSocketCounts.set(auth.sessionId, currentCount + 1);

    await broadcastPresence(io, store);

    const heartbeat = setInterval(async () => {
      try {
        await store.touchUsername(auth.normalizedUsername, auth.sessionId, config.presenceTtlSec);
      } catch {
        socket.emit("chat:error", { code: "PRESENCE_TOUCH_FAILED", message: "Failed to update presence" });
      }
    }, config.presenceHeartbeatSec * 1000);

    socket.on("chat:send", async (payload) => {
      try {
        const parsedPayload = chatSendSchema.safeParse(payload);
        if (!parsedPayload.success) {
          socket.emit("chat:error", {
            code: "INVALID_MESSAGE",
            message: "Message must be between 1 and 500 characters"
          });
          return;
        }

        const window = calculateRateLimitWindow(now(), config.rateLimitWindowSec);
        const counter = await store.incrementRateLimit(
          auth.normalizedUsername,
          window.windowStartSec,
          config.rateLimitWindowSec
        );

        if (counter > config.rateLimitCount) {
          socket.emit("chat:rate_limited", {
            retryAfterMs: window.retryAfterMs
          });
          return;
        }

        const message: ChatMessage = {
          id: await store.nextMessageId(),
          username: auth.username,
          text: parsedPayload.data.text,
          createdAt: new Date(now()).toISOString()
        };

        await store.pushMessage(message, config.messageHistoryLimit);
        io.emit("chat:new", message);
      } catch {
        socket.emit("chat:error", {
          code: "SEND_FAILED",
          message: "Unable to send message"
        });
      }
    });

    socket.on("disconnect", async () => {
      clearInterval(heartbeat);

      const openSocketCount = sessionSocketCounts.get(auth.sessionId) ?? 0;
      const nextSocketCount = Math.max(openSocketCount - 1, 0);

      if (nextSocketCount === 0) {
        sessionSocketCounts.delete(auth.sessionId);
        await store.releaseUsername(auth.normalizedUsername, auth.sessionId);
      } else {
        sessionSocketCounts.set(auth.sessionId, nextSocketCount);
      }

      await broadcastPresence(io, store);
    });
  });

  app.addHook("onClose", async () => {
    io.close();
  });

  return { app, io };
}
