import { historyResponseSchema, loginResponseSchema, type ChatMessage, type LoginResponse } from "@yt-chat/shared";

import { API_BASE_URL } from "./config";

interface ApiError {
  code?: string;
  message?: string;
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const possible = payload as ApiError;
  return possible.message ?? fallback;
}

export async function login(username: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ username })
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getErrorMessage(data, "Login failed"));
  }

  return loginResponseSchema.parse(data);
}

export async function logout(token: string): Promise<void> {
  await fetch(`${API_BASE_URL}/auth/logout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export async function fetchHistory(token: string, limit = 50): Promise<ChatMessage[]> {
  const response = await fetch(`${API_BASE_URL}/chat/history?limit=${limit}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getErrorMessage(data, "Unable to load history"));
  }

  return historyResponseSchema.parse(data).messages;
}
