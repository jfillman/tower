// Standalone eslint config: @backstage/cli's package lint wraps
// @backstage/cli/config/eslint.js's role-based factory, but that factory
// expects to run inside a full backstage monorepo (workspace globs,
// backstage.json) and fails to resolve/apply outside one - confirmed live
// while packaging this repo standalone. A plain @typescript-eslint setup
// avoids that dependency on monorepo auto-detection.
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  settings: {
    react: { version: 'detect' },
  },
  env: { browser: true, es2022: true, node: true },
  rules: {
    'react/prop-types': 'off',
    'react/react-in-jsx-scope': 'off',
    // Backstage's own real lint config (as run inside the backstage repo)
    // doesn't enforce this rule - confirmed live, it reports zero
    // unescaped-entity findings there against the same JSX. Left on here it
    // would flag ~76 pre-existing lines unrelated to this packaging change.
    'react/no-unescaped-entities': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'off',
    'no-nested-ternary': 'error',
  },
  ignorePatterns: ['dist/', 'dist-types/', 'node_modules/'],
};
