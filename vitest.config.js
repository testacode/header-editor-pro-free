import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'coverage/**',
        '**/*.config.js',
        '**/*.config.mjs',
        'src/__tests__/**',
        'scripts/**',
      ],
      reportsDirectory: './coverage',
      thresholds: {
        // Vitest 4 uses AST-aware V8 remapping (more precise than v3).
        // After plan 016 coverage uplift: stmts 77.97%, branches 68.78%,
        // funcs 57.52%, lines 78.15%. Thresholds set to nearest multiple-of-5
        // at or below each value, so a regression breaks CI.
        statements: 75,
        branches: 65,
        functions: 55,
        lines: 75,
      },
    },
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules/**', 'dist/**', 'coverage/**', '**/*.config.js', '**/*.config.mjs'],
  },
});
