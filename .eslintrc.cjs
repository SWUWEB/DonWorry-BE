module.exports = {
  env: {
    es2023: true,
    node: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    sourceType: 'module',
  },
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
};
