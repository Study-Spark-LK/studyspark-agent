/**
 * Tests for Group 8 — withTimeout helper
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { withTimeout, classifyError } from '../src/lib/utils.js';

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('resolves with the value when the promise resolves before the timeout', async () => {
    const result = await withTimeout(Promise.resolve('hello'), 1_000);
    expect(result).toBe('hello');
  });

  it('resolves with a complex value (object) correctly', async () => {
    const obj = { status: 'ok', data: [1, 2, 3] };
    const result = await withTimeout(Promise.resolve(obj), 1_000);
    expect(result).toEqual(obj);
  });

  it('resolves with undefined when the promise resolves with undefined', async () => {
    const result = await withTimeout(Promise.resolve(undefined), 1_000);
    expect(result).toBeUndefined();
  });

  // ── Rejection before timeout ──────────────────────────────────────────────

  it('propagates rejection when the inner promise rejects before the deadline', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('inner error')), 1_000),
    ).rejects.toThrow('inner error');
  });

  it('preserves the original error type when the inner promise rejects', async () => {
    class CustomError extends Error {}
    await expect(
      withTimeout(Promise.reject(new CustomError('custom')), 1_000),
    ).rejects.toBeInstanceOf(CustomError);
  });

  // ── Timeout fires ─────────────────────────────────────────────────────────

  it('rejects with a timeout error when the promise exceeds the deadline', async () => {
    vi.useFakeTimers();
    const neverResolves = new Promise<never>(() => {});
    const race = withTimeout(neverResolves, 5_000);
    vi.runAllTimers();
    await expect(race).rejects.toThrow('timeout: request exceeded 5000ms');
  });

  it('timeout error message includes the deadline in milliseconds', async () => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => {});
    const race = withTimeout(never, 30_000);
    vi.runAllTimers();
    await expect(race).rejects.toThrow('30000ms');
  });

  it('fires the timeout at the exact deadline, not before', async () => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => {});
    const race = withTimeout(never, 1_000);

    // Advance to just before the deadline — no rejection yet
    vi.advanceTimersByTime(999);
    let settled = false;
    race.catch(() => { settled = true; });
    // Flush microtasks: promise should still be pending
    await Promise.resolve();
    expect(settled).toBe(false);

    // Now fire the deadline
    vi.advanceTimersByTime(1);
    await expect(race).rejects.toThrow(/timeout/i);
  });

  // ── Integration with classifyError ───────────────────────────────────────

  it('timeout error classifies as 504 GEMINI_TIMEOUT', async () => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => {});
    const race = withTimeout(never, 5_000);
    vi.runAllTimers();

    try {
      await race;
    } catch (err) {
      const { status, code } = classifyError(err);
      expect(status).toBe(504);
      expect(code).toBe('GEMINI_TIMEOUT');
    }
  });

  it('inner rejection error classifies correctly (not as 504)', async () => {
    try {
      await withTimeout(Promise.reject(new Error('something broke')), 1_000);
    } catch (err) {
      const { status } = classifyError(err);
      expect(status).toBe(500);
    }
  });
});
