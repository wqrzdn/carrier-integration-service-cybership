import 'dotenv/config';

/*
 * This is our config manager. Instead of just using process.env everywhere, I’ve 
 * built it to "Fail Fast." If a required key like UPS_CLIENT_ID is missing, the 
 * app will crash immediately on startup with a clear error. This is much better 
 * than starting up fine and then failing 2 hours later when a customer tries 
 * to get a shipping rate.
 */

function require_env(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function parse_positive_int(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer, got: ${value}`);
  }
  return parsed;
}

function validate_url(url: string): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error(`UPS_BASE_URL must be a valid HTTP(S) URL, got: ${url}`);
  }
  return url;
}

export const config = {
  ups: {
    clientId: require_env('UPS_CLIENT_ID'),
    clientSecret: require_env('UPS_CLIENT_SECRET'),
    baseUrl: validate_url(process.env['UPS_BASE_URL'] ?? 'https://wwwcie.ups.com'),
    timeoutMs: parse_positive_int('UPS_TIMEOUT_MS', 10_000),
    tokenBufferSeconds: parse_positive_int('UPS_TOKEN_BUFFER_SECONDS', 60),
  },
} as const;