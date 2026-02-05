import process from "node:process";
import "dotenv/config";

import Redis from "ioredis";

import { createApp } from "./app";
import { loadConfig } from "./config";
import { RedisChatStore } from "./store/redis-store";

async function bootstrap(): Promise<void> {
  const config = loadConfig(process.env, { requireRedis: true });
  const redis = new Redis(config.redisUrl!);

  await redis.ping();

  const store = new RedisChatStore(redis);
  const { app } = await createApp({ config, store });

  const shutdown = async (signal: NodeJS.Signals) => {
    app.log.info({ signal }, "Shutting down");
    await app.close();
    await redis.quit();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({
    host: "0.0.0.0",
    port: config.port
  });
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
