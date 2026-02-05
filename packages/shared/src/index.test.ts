import { describe, expect, it } from "vitest";

import { messageTextSchema, normalizeUsername, usernameSchema } from "./index";

describe("usernameSchema", () => {
  it("accepts valid username", () => {
    const result = usernameSchema.safeParse("User_123");
    expect(result.success).toBe(true);
  });

  it("rejects invalid symbols", () => {
    const result = usernameSchema.safeParse("bad-name");
    expect(result.success).toBe(false);
  });

  it("rejects short username", () => {
    const result = usernameSchema.safeParse("ab");
    expect(result.success).toBe(false);
  });
});

describe("messageTextSchema", () => {
  it("trims and accepts non-empty message", () => {
    const result = messageTextSchema.safeParse("   hello   ");
    expect(result.success).toBe(true);
  });

  it("rejects empty message", () => {
    const result = messageTextSchema.safeParse("    ");
    expect(result.success).toBe(false);
  });
});

describe("normalizeUsername", () => {
  it("normalizes username", () => {
    expect(normalizeUsername("  Alice ")).toBe("alice");
  });
});
