import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // One .env at the repo root serves both the API and the web app.
  envDir: '../..',
  server: {
    port: 5173,
    // Mirrors the Vercel rewrite: the browser calls /api on its own origin.
    proxy: { '/api': 'http://localhost:4000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
