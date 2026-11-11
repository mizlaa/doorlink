import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

/** Next's recommended rules (React, hooks, accessibility basics, Core Web Vitals) and TypeScript. */
export default [
  { ignores: ['.next/**', 'node_modules/**', 'android/**', 'ios/**', 'public/**', 'out/**', 'backups/**', '.outbox/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Logos and user photos are served by our own routes with their own caching.
      '@next/next/no-img-element': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
]
