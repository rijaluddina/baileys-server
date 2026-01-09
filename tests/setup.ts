import { vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";

// Mock environment
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
process.env.REDIS_HOST = "localhost";
process.env.REDIS_PORT = "6379";

// Global test utilities
beforeAll(() => {
    // Setup before all tests
});

afterAll(() => {
    // Cleanup after all tests
});

beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
});

afterEach(() => {
    // Cleanup after each test
});

// Export test utilities
export { vi };
