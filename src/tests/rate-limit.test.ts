import { describe, it, expect, vi, afterEach } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to max attempts within the window", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5, 60_000)).toBe(true);
    }
    expect(checkRateLimit(key, 5, 60_000)).toBe(false);
  });

  it("resets after the window expires", () => {
    vi.useFakeTimers();
    const key = `test:${Math.random()}`;

    for (let i = 0; i < 3; i++) checkRateLimit(key, 3, 60_000);
    expect(checkRateLimit(key, 3, 60_000)).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(checkRateLimit(key, 3, 60_000)).toBe(true);
  });

  it("tracks keys independently", () => {
    const a = `test:${Math.random()}`;
    const b = `test:${Math.random()}`;

    expect(checkRateLimit(a, 1, 60_000)).toBe(true);
    expect(checkRateLimit(a, 1, 60_000)).toBe(false);
    expect(checkRateLimit(b, 1, 60_000)).toBe(true);
  });
});
