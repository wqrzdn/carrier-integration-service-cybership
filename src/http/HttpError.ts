export class HttpError extends Error {
  /* * Custom error for when the server actually responds but with a failure code (4xx, 5xx).
   * I've separated the 'status' and 'body' so we can easily check for specific issues
   * like 429 rate limits or 401 auth failures without having to parse a string.
   */
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    public readonly cause?: unknown
  ) {
    super(`HTTP ${status}`);
    this.name = 'HttpError';
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpError);
    }
  }
}