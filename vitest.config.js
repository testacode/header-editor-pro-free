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
        // New measurements: stmts 67.96%, branches 63.69%, funcs 51.76%, lines 67.98%.
        // Thresholds set to nearest multiple-of-5 at or below each new value.
        statements: 65,
        branches: 60,
        functions: 50,
        lines: 65,
      },
    },
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules/**', 'dist/**', 'coverage/**', '**/*.config.js', '**/*.config.mjs'],
  },
});
