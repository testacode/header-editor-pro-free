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
        statements: 70,
        branches: 85,
        functions: 65,
        lines: 70,
      },
    },
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules/**', 'dist/**', 'coverage/**', '**/*.config.js', '**/*.config.mjs'],
  },
});
