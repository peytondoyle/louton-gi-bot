module.exports = {
  env: { node: true, es2022: true },
  extends: ['eslint:recommended'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['unused-imports', 'import'],
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^', varsIgnorePattern: '^' }],
    'unused-imports/no-unused-imports': 'error',
    'import/no-unused-modules': ['error', { unusedExports: true, ignoreExports: ['**/index.js'] }],
  },
};
