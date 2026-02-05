import { describe, expect, it } from "vitest";

import { signAuthToken, verifyAuthToken } from "../src/utils/jwt";

describe("jwt", () => {
  it("signs and verifies auth token", () => {
    const token = signAuthToken(
      {
        sessionId: "68f288f8-c246-4f1e-8c43-f6f008fd0276",
        username: "Alice",
        normalizedUsername: "alice"
      },
      "test-secret-test-secret",
      "1h"
    );

    const payload = verifyAuthToken(token, "test-secret-test-secret");

    expect(payload.sessionId).toBe("68f288f8-c246-4f1e-8c43-f6f008fd0276");
    expect(payload.username).toBe("Alice");
    expect(payload.normalizedUsername).toBe("alice");
  });
});
