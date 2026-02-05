import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3001),
    REDIS_URL: z.string().url().optional(),
    JWT_SECRET: z.string().min(16).default("dev-secret-change-me-123"),
    JWT_EXPIRES_IN: z.string().default("24h"),
    SESSION_TTL_SEC: z.coerce.number().int().min(60).default(86400),
    CORS_ORIGIN: z.string().default("*"),
    MESSAGE_HISTORY_LIMIT: z.coerce.number().int().min(10).max(1000).default(200),
    RATE_LIMIT_COUNT: z.coerce.number().int().min(1).max(200).default(5),
    RATE_LIMIT_WINDOW_SEC: z.coerce.number().int().min(1).max(300).default(10),
    PRESENCE_TTL_SEC: z.coerce.number().int().min(10).max(3600).default(120),
    PRESENCE_HEARTBEAT_SEC: z.coerce.number().int().min(5).max(600).default(30)
  })
  .superRefine((value, ctx) => {
    if (value.PRESENCE_HEARTBEAT_SEC >= value.PRESENCE_TTL_SEC) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "PRESENCE_HEARTBEAT_SEC must be lower than PRESENCE_TTL_SEC",
        path: ["PRESENCE_HEARTBEAT_SEC"]
      });
    }
  });

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  redisUrl: string | undefined;
  jwtSecret: string;
  jwtExpiresIn: string;
  sessionTtlSec: number;
  corsOrigin: string;
  messageHistoryLimit: number;
  rateLimitCount: number;
  rateLimitWindowSec: number;
  presenceTtlSec: number;
  presenceHeartbeatSec: number;
}

interface LoadConfigOptions {
  requireRedis?: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, options: LoadConfigOptions = {}): AppConfig {
  const parsed = envSchema.parse(env);

  if (options.requireRedis && !parsed.REDIS_URL) {
    throw new Error("REDIS_URL is required");
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    redisUrl: parsed.REDIS_URL,
    jwtSecret: parsed.JWT_SECRET,
    jwtExpiresIn: parsed.JWT_EXPIRES_IN,
    sessionTtlSec: parsed.SESSION_TTL_SEC,
    corsOrigin: parsed.CORS_ORIGIN,
    messageHistoryLimit: parsed.MESSAGE_HISTORY_LIMIT,
    rateLimitCount: parsed.RATE_LIMIT_COUNT,
    rateLimitWindowSec: parsed.RATE_LIMIT_WINDOW_SEC,
    presenceTtlSec: parsed.PRESENCE_TTL_SEC,
    presenceHeartbeatSec: parsed.PRESENCE_HEARTBEAT_SEC
  };
}

export function createTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: "test",
    port: 0,
    redisUrl: undefined,
    jwtSecret: "test-secret-test-secret",
    jwtExpiresIn: "24h",
    sessionTtlSec: 86400,
    corsOrigin: "*",
    messageHistoryLimit: 200,
    rateLimitCount: 5,
    rateLimitWindowSec: 10,
    presenceTtlSec: 120,
    presenceHeartbeatSec: 30,
    ...overrides
  };
}
