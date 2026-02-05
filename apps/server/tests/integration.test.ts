import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";

import { createApp } from "../src/app";
import { createTestConfig } from "../src/config";
import { InMemoryChatStore } from "../src/store/in-memory-store";

interface LoginResult {
  token: string;
  username: string;
  expiresIn: string;
}

function onceEvent<T>(socket: ClientSocket, event: string, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);

    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function waitForMessageText(socket: ClientSocket, targetText: string, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("chat:new", onMessage);
      reject(new Error(`Timed out waiting for message text ${targetText}`));
    }, timeoutMs);

    const onMessage = (payload: { text: string }) => {
      if (payload.text !== targetText) {
        return;
      }

      clearTimeout(timer);
      socket.off("chat:new", onMessage);
      resolve();
    };

    socket.on("chat:new", onMessage);
  });
}

async function connectSocket(url: string, token: string): Promise<ClientSocket> {
  const socket = ioClient(url, {
    auth: { token },
    transports: ["websocket"],
    reconnection: false,
    forceNew: true
  });

  await onceEvent(socket, "connect");
  return socket;
}

describe("integration", () => {
  const sockets: ClientSocket[] = [];
  const apps: FastifyInstance[] = [];

  afterEach(async () => {
    for (const socket of sockets) {
      socket.disconnect();
    }
    sockets.length = 0;

    for (const app of apps) {
      await app.close();
    }
    apps.length = 0;
  });

  it("login succeeds and duplicate username is rejected", async () => {
    const now = Date.now();
    const store = new InMemoryChatStore(() => now);
    const { app } = await createApp({
      config: createTestConfig(),
      store,
      now: () => now
    });
    apps.push(app);

    await app.ready();

    const first = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: "Alice" }
    });

    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: "Alice" }
    });

    expect(second.statusCode).toBe(409);
  });

  it("broadcasts messages and returns history in chronological order", async () => {
    let now = Date.now();
    const store = new InMemoryChatStore(() => now);
    const { app } = await createApp({
      config: createTestConfig(),
      store,
      now: () => now
    });
    apps.push(app);

    const baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });

    const aliceLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: "Alice" }
    });

    const bobLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: "Bob" }
    });

    const aliceToken = (aliceLogin.json() as LoginResult).token;
    const bobToken = (bobLogin.json() as LoginResult).token;

    const aliceSocket = await connectSocket(baseUrl, aliceToken);
    const bobSocket = await connectSocket(baseUrl, bobToken);
    sockets.push(aliceSocket, bobSocket);

    const bobMessagePromise = onceEvent<{ text: string; username: string }>(bobSocket, "chat:new");
    aliceSocket.emit("chat:send", { text: "first" });
    const firstMessage = await bobMessagePromise;
    expect(firstMessage.text).toBe("first");
    expect(firstMessage.username).toBe("Alice");

    now += 1000;
    const secondMessagePromise = onceEvent<{ text: string }>(bobSocket, "chat:new");
    aliceSocket.emit("chat:send", { text: "second" });
    await secondMessagePromise;

    const historyResponse = await app.inject({
      method: "GET",
      url: "/chat/history?limit=50",
      headers: { authorization: `Bearer ${aliceToken}` }
    });

    expect(historyResponse.statusCode).toBe(200);
    const history = historyResponse.json() as { messages: Array<{ text: string }> };
    expect(history.messages.map((message) => message.text)).toEqual(["first", "second"]);

  });

  it("applies message rate limit and emits retry-after", async () => {
    let now = Date.now();
    const store = new InMemoryChatStore(() => now);
    const { app } = await createApp({
      config: createTestConfig({
        rateLimitCount: 5,
        rateLimitWindowSec: 10
      }),
      store,
      now: () => now
    });
    apps.push(app);

    const baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: "Alice" }
    });

    const token = (login.json() as LoginResult).token;
    const socket = await connectSocket(baseUrl, token);
    sockets.push(socket);

    const rateLimitedPromise = onceEvent<{ retryAfterMs: number }>(socket, "chat:rate_limited");

    for (let i = 0; i < 6; i += 1) {
      socket.emit("chat:send", { text: `m${i}` });
    }

    const rateLimited = await rateLimitedPromise;
    expect(rateLimited.retryAfterMs).toBeGreaterThan(0);

    now += 11_000;

    const messagePromise = waitForMessageText(socket, "after-window");
    socket.emit("chat:send", { text: "after-window" });
    await messagePromise;

  });
});
