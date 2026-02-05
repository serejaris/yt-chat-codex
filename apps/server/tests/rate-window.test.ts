import { describe, expect, it } from "vitest";

import { calculateRateLimitWindow } from "../src/rate-limit/window";

describe("calculateRateLimitWindow", () => {
  it("calculates current fixed window", () => {
    const result = calculateRateLimitWindow(12_345, 10);

    expect(result.windowStartSec).toBe(10);
    expect(result.windowEndSec).toBe(20);
    expect(result.retryAfterMs).toBe(7_655);
  });
});
