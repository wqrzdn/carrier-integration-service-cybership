export class CarrierError extends Error {
  /* * * This is our "Smart Error" class. Instead of just a generic message, I've added 
   * a 'retryable' flag and a specific 'code'. This way, our frontend or any 
   * middleware knows exactly when to trigger a retry (like for a 429 rate limit) 
   * or when to stop (like for a 400 bad request) without guessing.
   */
  constructor(
    public readonly code: string,
    public readonly carrier: string,
    public readonly retryable: boolean,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'CarrierError';
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CarrierError);
    }
  }
}