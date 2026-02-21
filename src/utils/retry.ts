export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  shouldRetry?: (error: unknown) => boolean;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1000, 
  maxDelayMs: 8000, 
  backoffMultiplier: 2, 
};

/*
 * this is our "never give up" utility. if a network request fails 
 * because of a temporary glitch it will automatically try again. 
 * i used exponential backoff so we do not spam the server-instead 
 * we wait longer and longer between each try. i also added jitter 
 * to prevent the "thundering herd" problem where every client 
 * retries at the exact same millisecond.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (opts.shouldRetry && !opts.shouldRetry(error)) {
        throw error;
      }

      if (attempt === opts.maxAttempts) {
        break;
      }

      const delay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelayMs
      );

      const jitter = delay * (0.75 + Math.random() * 0.5);

      await sleep(jitter);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}