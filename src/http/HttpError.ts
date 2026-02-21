export class HttpError extends Error {
  /* * custom error for when the server actually responds but with a failure code.
   * i separated status and body so we can easily check for specific issues
   * like 429 rate limits or 401 auth failures without parsing strings.
   */
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    public readonly cause?: unknown
  ) {
    super(`http ${status}`);
    this.name = 'HttpError';
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpError);
    }
  }
}