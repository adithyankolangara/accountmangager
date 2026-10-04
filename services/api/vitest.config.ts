import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Each test file boots its own in-memory PostgreSQL (PGlite) and runs every migration;
    // with files running in parallel that can take tens of seconds on a busy machine.
    hookTimeout: 120_000,
    testTimeout: 60_000,
  },
});
