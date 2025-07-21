module.exports = {
  extends: ['../../.eslintrc.js'],
  env: {
    node: true,
    es2021: true,
  },
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
  },
  overrides: [
    {
      files: ['*.js'],
      env: {
        node: true,
      },
    },
    {
      files: ['*.tsx', '*.ts'],
      parserOptions: {
        project: './tsconfig.json',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  ],
  rules: {
    // Mobile-specific rules
    '@typescript-eslint/no-explicit-any': 'warn',
  },
};
