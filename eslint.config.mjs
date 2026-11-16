import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(
  { ignores: ['**/node_modules/**', '**/.next/**', '.data/**', 'dist/**', 'playwright-report/**', 'test-results/**', '**/next-env.d.ts', 'apps/web/public/ocr/**'] },
  js.configs.recommended, ...ts.configs.recommended,
  { files: ['**/*.ts', '**/*.tsx'], rules: { '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] } },
  { files: ['**/*.mjs'], languageOptions: { globals: { process: 'readonly' } } }
);
