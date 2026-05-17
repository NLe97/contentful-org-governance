type ErrLike = { status?: number };
export type RetryOpts = { maxAttempts: number; baseMs: number };

function retriable(e: ErrLike): boolean {
  const s = e.status ?? 0;
  return s === 429 || (s >= 500 && s < 600);
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts): Promise<T> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < opts.maxAttempts) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (!retriable(e as ErrLike)) throw e;
      attempt++;
      if (attempt >= opts.maxAttempts) break;
      const jitter = Math.random() * opts.baseMs;
      const delay = opts.baseMs * Math.pow(2, attempt - 1) + jitter;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
