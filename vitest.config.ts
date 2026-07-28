import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    // Mirror the "@/*" -> "./*" path alias from tsconfig.json so test files
    // import modules exactly the way the app does.
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // The pure logic under lib/ is what these tests are accountable for.
      // Routes, React components, and the DB driver are exercised by the
      // integration script and manual verification instead.
      include: ['lib/**/*.ts'],
      exclude: ['lib/db.ts', 'lib/seed.ts', 'lib/google/**', 'lib/types.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
