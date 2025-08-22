module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.js'],
  testPathIgnorePatterns: ['<rootDir>/src/__tests__/setup.js'],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.{js,ts}', '<rootDir>/src/**/*.{test,spec}.{js,ts}'],
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/**/__tests__/**',
    '!src/**/*.test.{js,ts}',
    '!src/**/*.spec.{js,ts}',
    '!src/manifest.json',
    '!src/popup/popup.html',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleFileExtensions: ['js', 'ts', 'json'],
  transform: {
    '^.+\\.(js|ts)$': 'babel-jest',
  },
  transformIgnorePatterns: ['node_modules/(?!(jest-chrome)/)'],
  clearMocks: true,
  restoreMocks: true,
  verbose: true,
};
