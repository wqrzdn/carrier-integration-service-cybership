/**
 * Global test setup - runs before all tests
 * Silences console output during tests for cleaner results
 */

// Store original console methods
const originalWarn = console.warn;
const originalError = console.error;

beforeAll(() => {
  // Mock console methods during tests
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  // Restore original console methods
  console.warn = originalWarn;
  console.error = originalError;
});
