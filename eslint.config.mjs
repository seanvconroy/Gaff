import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// ADR-0007: only a signed-in person can make a decision about a renter.
const decisionGuard = {
  group: ['@/server/decisions', '@/server/decisions/*'],
  message:
    'Only a signed-in person can make a decision about a renter (ADR-0007). Jobs, adapters and domain code may not create decisions.',
};

const styleGuard = {
  propName: 'style',
  message: 'Style with CSS Modules and design tokens, not inline styles (ADR-0011).',
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'node_modules/**',
    'drizzle/**',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
    'src/styles/tokens.ts',
  ]),
  {
    rules: {
      'react/forbid-dom-props': ['error', { forbid: [styleGuard] }],
      'react/forbid-component-props': ['error', { forbid: [styleGuard] }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "TSAsExpression > TSTypeReference[typeName.name='PersonDecision']",
          message: 'Only src/server/decisions may create a PersonDecision (ADR-0007).',
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
  {
    files: ['src/server/decisions/**', '**/*.test.ts', 'tests/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['src/jobs/**', 'src/adapters/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [decisionGuard] }] },
  },
  {
    files: ['src/domain/**'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            decisionGuard,
            {
              group: [
                '@/db',
                '@/db/*',
                '@/server',
                '@/server/*',
                '@/adapters/*',
                '@/jobs/*',
                'next',
                'next/*',
                'react',
                'pg',
                'drizzle-orm',
                'drizzle-orm/*',
              ],
              message: 'Domain code is pure rules: no I/O and no framework (architecture.md).',
            },
          ],
        },
      ],
    },
  },
]);
