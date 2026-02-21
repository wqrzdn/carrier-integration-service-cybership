/**
 * Global test setup - suppress console output during Jest runs
 * Useful for reducing noise from expected warnings or errors
 * in carrier integration tests.
 */

// Preserve original console methods
const originalWarn = console.warn;
const originalError = console.error;

beforeAll(() => {
  // Silence console.warn and console.error globally
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  // Restore original console methods after tests
  console.warn = originalWarn;
  console.error = originalError;
});