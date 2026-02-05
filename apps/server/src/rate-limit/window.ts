export interface RateLimitWindow {
  windowStartSec: number;
  windowEndSec: number;
  retryAfterMs: number;
}

export function calculateRateLimitWindow(nowMs: number, windowSec: number): RateLimitWindow {
  const nowSec = Math.floor(nowMs / 1000);
  const windowStartSec = Math.floor(nowSec / windowSec) * windowSec;
  const windowEndSec = windowStartSec + windowSec;
  const retryAfterMs = Math.max(windowEndSec * 1000 - nowMs, 0);

  return {
    windowStartSec,
    windowEndSec,
    retryAfterMs
  };
}
