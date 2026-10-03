/** Unit + component tests (no external services). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
  testPathIgnorePatterns: ['\\.int\\.spec\\.ts$'],
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/*.module.ts', '!src/**/index.ts', '!src/kernel/db/migrate.ts'],
  coverageReporters: ['text-summary', 'json-summary', 'lcov'],
  coverageThreshold: { global: { lines: 85, branches: 75, functions: 85, statements: 85 } },
  transform: { '^.+\\.ts$': ['ts-jest', { isolatedModules: true }] },
};
