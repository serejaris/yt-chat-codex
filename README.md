# Realtime Chat MVP

MVP чат в реальном времени с логином только по имени, одной общей комнатой, хранением последних сообщений в Redis и серверным rate limit.

## Features

- Login only by username (`3..20`, `A-Z a-z 0-9 _`)
- Realtime messaging via Socket.IO
- One global room
- Online presence list
- Username uniqueness among online users
- Rate limit: `5 messages / 10 seconds` with `retry-after`
- Redis-only history buffer (last `N` messages)

## Tech Stack

- Backend: Node.js, TypeScript, Fastify, Socket.IO, Redis
- Frontend: React, Vite, TypeScript
- Shared contracts: `zod` schemas in `packages/shared`

## Monorepo Layout

- `apps/server` - API + WebSocket server
- `apps/web` - React client
- `packages/shared` - shared schemas and types

## Local Run

1. Install dependencies:

```bash
npm install
```

2. Start Redis locally:

```bash
docker compose up -d
```

3. Configure env:

```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
```

4. Start backend + frontend:

```bash
npm run dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:3001`

## Scripts

```bash
npm run dev
npm test
npm run build
```

## API

### `POST /auth/login`

Request:

```json
{ "username": "Alice" }
```

Success:

```json
{ "token": "...", "username": "Alice", "expiresIn": "24h" }
```

### `POST /auth/logout`

Header: `Authorization: Bearer <token>`

### `GET /chat/history?limit=50`

Header: `Authorization: Bearer <token>`

Success:

```json
{ "messages": [{ "id": 1, "username": "Alice", "text": "Hi", "createdAt": "..." }] }
```

## Socket.IO Events

Client -> Server:

- `chat:send` `{ text: string, clientMessageId?: string }`

Server -> Client:

- `chat:new` `ChatMessage`
- `chat:rate_limited` `{ retryAfterMs: number }`
- `presence:update` `{ users: string[] }`
- `chat:error` `{ code: string, message: string }`

## Railway Deployment

Create three Railway resources:

1. `server` service
2. `web` service
3. `Redis` plugin

Use repository root as working directory for both services (workspace commands rely on monorepo root).

### Server service settings

- Build command: `npm install && npm run build -w @yt-chat/shared && npm run build -w @yt-chat/server`
- Start command: `npm run start -w @yt-chat/server`

Recommended env vars on server:

- `NODE_ENV=production`
- `PORT` (Railway sets this automatically)
- `REDIS_URL=<Railway Redis URL>`
- `JWT_SECRET=<long-random-string>`
- `JWT_EXPIRES_IN=24h`
- `SESSION_TTL_SEC=86400`
- `CORS_ORIGIN=<your-web-domain>`
- `MESSAGE_HISTORY_LIMIT=200`
- `RATE_LIMIT_COUNT=5`
- `RATE_LIMIT_WINDOW_SEC=10`
- `PRESENCE_TTL_SEC=120`
- `PRESENCE_HEARTBEAT_SEC=30`

### Web service settings

- Build command: `npm install && npm run build -w @yt-chat/shared && npm run build -w @yt-chat/web`
- Start command: `npm run -w @yt-chat/web preview -- --host 0.0.0.0 --port $PORT`

Web env vars:

- `VITE_API_URL=https://<server-domain>`
- `VITE_WS_URL=https://<server-domain>`

## Notes

- History is bounded ring buffer in Redis (`MESSAGE_HISTORY_LIMIT`)
- Presence is TTL-based and refreshed by heartbeat
- If user refreshes while token is valid, session is reused automatically
