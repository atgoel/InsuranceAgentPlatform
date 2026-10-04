import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-console': 'error',
      complexity: ['error', 12],
      // No packed code: one statement per line, readable line length (AGENTS.md "Lessons from the M07 review")
      'max-statements-per-line': ['error', { max: 1 }],
      'max-len': ['error', { code: 180, ignoreStrings: true, ignoreTemplateLiterals: true, ignoreUrls: true, ignoreComments: true, ignoreRegExpLiterals: true }],
      'max-lines-per-function': ['warn', { max: 120, skipBlankLines: true, skipComments: true }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  { files: ['**/*.test.{ts,tsx}', 'src/test/**'], rules: { 'max-lines-per-function': 'off' } },
);
