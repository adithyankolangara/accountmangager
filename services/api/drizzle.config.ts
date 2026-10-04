import { defineConfig } from 'drizzle-kit';

// Generates reviewable SQL migrations from the schema. Generation needs no database connection.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: '../../database/migrations',
});
