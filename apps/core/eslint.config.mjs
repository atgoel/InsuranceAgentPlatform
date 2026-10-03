import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', '*.js', '*.mjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { sonarjs },
    rules: {
      // Clean-code guard rails (docs/spec/01-engineering-standards.md)
      'no-console': 'error', // all output goes through the kernel Logger
      complexity: ['error', 10],
      'max-lines-per-function': ['warn', { max: 60, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', 4],
      'max-depth': ['error', 3],
      'sonarjs/cognitive-complexity': ['error', 15],
      'sonarjs/no-duplicate-string': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Layering: domain code must not depend on frameworks or infrastructure
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['src/modules/*/domain/**/*.ts', 'src/kernel/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['@nestjs/*', 'pg', 'express', '**/infrastructure/**', '**/api/**'], message: 'Domain layer must stay framework-free (Dependency Inversion).' },
      ] }],
    },
  },
  {
    files: ['src/modules/*/application/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['pg', 'express', '**/infrastructure/**', '**/api/**'], message: 'Application layer depends on ports, not adapters.' },
      ] }],
    },
  },
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: { 'max-lines-per-function': 'off', 'sonarjs/no-duplicate-string': 'off', '@typescript-eslint/no-non-null-assertion': 'off' },
  },
);
