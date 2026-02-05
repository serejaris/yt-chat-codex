import { z } from "zod";

export const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(USERNAME_REGEX, "Username can contain only letters, numbers, and underscore");

export const messageTextSchema = z
  .string()
  .trim()
  .min(1, "Message cannot be empty")
  .max(500, "Message is too long");

export const loginRequestSchema = z.object({
  username: usernameSchema
});

export const loginResponseSchema = z.object({
  token: z.string(),
  username: z.string(),
  expiresIn: z.string()
});

export const chatMessageSchema = z.object({
  id: z.number().int().positive(),
  username: z.string(),
  text: z.string(),
  createdAt: z.string()
});

export const historyResponseSchema = z.object({
  messages: z.array(chatMessageSchema)
});

export const chatSendSchema = z.object({
  text: messageTextSchema,
  clientMessageId: z.string().optional()
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type HistoryResponse = z.infer<typeof historyResponseSchema>;
export type ChatSendPayload = z.infer<typeof chatSendSchema>;

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}
