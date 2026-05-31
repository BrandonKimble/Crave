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
      globals: {
        __DEV__: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
      },
      rules: {
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-var-requires': 'off',
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
    {
      // Logic test files (Jest + fast-check). Jest matcher globals are typed as
      // `any`, so the type-aware "unsafe" rules fire on every expect()/describe();
      // disable them here (same relaxation we apply to *.js) and register jest env.
      // Specs are excluded from tsconfig.json (so `tsc` skips them) and live in
      // tsconfig.spec.json instead — point the type-aware parser there, or it
      // can't find the file in a project and errors.
      files: ['*.spec.ts'],
      env: {
        jest: true,
      },
      parserOptions: {
        project: './tsconfig.spec.json',
      },
      rules: {
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
      },
    },
    {
      // Decision-layer purity (architecture fitness function).
      // These modules are unit-tested in plain Node (Jest, no React Native
      // runtime) with property-based tests that run in milliseconds. They MUST
      // stay free of native/runtime imports or those tests stop working — a
      // native import here would force a simulator/build into the loop again.
      // If you need RN/Expo here, the logic is in the wrong layer.
      files: [
        'src/screens/Search/utils/map-render-model.ts',
        'src/screens/Search/utils/marker-lod.ts',
        'src/screens/Search/utils/quality.ts',
        'src/utils/quality-color.ts',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: 'react',
                message: 'Decision-layer must stay Node-pure (see jest specs). No React.',
              },
              {
                name: 'react-native',
                message: 'Decision-layer must stay Node-pure (see jest specs). No react-native.',
              },
            ],
            patterns: [
              {
                group: [
                  '@rnmapbox/*',
                  'expo',
                  'expo-*',
                  'expo/*',
                  'react-native/*',
                  '@react-native/*',
                  '@react-native-*/*',
                  '@react-navigation/*',
                ],
                message:
                  'Decision-layer must stay Node-pure (see jest specs). No native/runtime imports.',
              },
            ],
          },
        ],
      },
    },
  ],
  rules: {
    // Mobile-specific rules
    '@typescript-eslint/no-explicit-any': 'warn',
  },
};
