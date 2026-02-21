import 'dotenv/config';

/*
 * this is the main config manager. i built it to fail fast so if anything 
 * like ups client id is missing the app crashes at startup with a clear 
 * error. much better than failing at 2 am when a customer is trying 
 * to checkout.
 */

function require_env(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`missing required environment variable: ${key}`);
  }
  return value;
}

function parse_positive_int(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) {
    // safety first never log secret values here
    throw new Error(`${key} must be a positive integer`);
  }
  return parsed;
}

function validate_url(url: string): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error(`ups base url must be valid http(s) url got: ${url}`);
  }
  
  // prod safety need https to prevent middleman attacks
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && url.startsWith('http://')) {
    throw new Error('https required in production for ups base url');
  }
  
  return url;
}

export const config = {
  ups: {
    clientId: require_env('UPS_CLIENT_ID'),
    clientSecret: require_env('UPS_CLIENT_SECRET'),
    baseUrl: validate_url(process.env['UPS_BASE_URL'] ?? 'https://wwwcie.ups.com'),
    timeoutMs: parse_positive_int('UPS_TIMEOUT_MS', 10000),
    tokenBufferSeconds: parse_positive_int('UPS_TOKEN_BUFFER_SECONDS', 60),
  },
} as const;