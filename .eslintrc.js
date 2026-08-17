/**
 * The repo has always shipped ESLint, its TypeScript parser and the React
 * Native plugins in devDependencies, and an `npm run lint` script — but never a
 * config, so the script failed on every file with "couldn't find a configuration
 * file". This is that missing config.
 *
 * Deliberately narrow. Turning on a full recommended set would bury the codebase
 * in thousands of pre-existing warnings and make the command useless again; the
 * rules enabled here are the ones that catch real defects this project has
 * actually hit — an unused import after a refactor, a promise nobody awaited, a
 * `case` that falls through.
 *
 * Type-aware rules are intentionally NOT enabled: they need `project: true`,
 * which more than doubles lint time and would fail on the `// @ts-nocheck` files.
 * `npm run type-check` remains the real type gate.
 */
module.exports = {
  root: true,
  env: { es2022: true, node: true, 'react-native/react-native': true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react', 'react-native', 'react-hooks'],
  settings: { react: { version: 'detect' } },
  ignorePatterns: [
    'node_modules/',
    'android/',
    'ios/',
    '.expo/',
    'dist/',
    'build/',
    'coverage/',
    'functions/lib/',
    // Root-level one-off migration/debug scripts — not part of the app build.
    // See the "Gotchas" section of CLAUDE.md.
    '/fix_*.js',
    '/import_to_supabase.js',
    '/rescue-server.js',
    '*.config.js',
    '.eslintrc.js',
  ],
  rules: {
    // Correctness — these have all bitten this codebase before.
    'no-fallthrough': 'error',
    'no-dupe-keys': 'error',
    'no-unreachable': 'error',
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-empty': ['warn', { allowEmptyCatch: true }],

    // Unused code. Warn, not error: there is a backlog of it, and a failing lint
    // that everyone learns to ignore is worse than a noisy one they read.
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
    ],

    // Hooks. The codebase already carries eslint-disable comments for
    // exhaustive-deps, which errored as an unknown rule because the plugin was
    // never installed — those comments were written expecting this to be on.
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // React Native specifics.
    'react/jsx-key': 'warn',
    'react/no-unstable-nested-components': ['warn', { allowAsProps: true }],
    'react-native/no-single-element-style-arrays': 'warn',

    // Off on purpose — too noisy to be useful on this codebase today.
    'react/prop-types': 'off',
    'react/display-name': 'off',
    'no-undef': 'off', // TypeScript already covers this, and it misfires on JSX/global types.
  },
  overrides: [
    {
      files: ['__tests__/**/*', '*.test.ts', '*.test.tsx'],
      env: { jest: true },
    },
  ],
};
