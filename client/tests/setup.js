import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { retryPolicy } from '../src/api/client.js';
import { server } from './server.js';

// Reads are retried when the server is unreachable; don't make tests wait for the real delay.
retryPolicy.delayMs = 0;

// Any request the test did not explicitly mock fails loudly instead of hitting the network.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());
