module.exports = {
  extends: ['../../.eslintrc.js'],
  env: {
    node: true,
    es2021: true,
  },
  // F808 (2026-08-03) — REACT HOOKS LINTING, LANDED STAGED.
  //
  // A 37k-line React Native app had NO `eslint-plugin-react-hooks` anywhere in the chain:
  // every runtime hook's dependency array was hand-maintained with zero enforcement. The
  // cost was already visible in code that REASONED ABOUT A LINTER THAT WASN'T THERE —
  // `screens/EntitlementLapseHost.tsx` carried a bare `// eslint-disable-line` (no rule
  // name, so it disabled EVERY rule on that line) to silence a rule that was not installed,
  // and `screens/onboarding/OnboardingTeaser.tsx` wrote a comment explaining that no
  // disable was needed because the plugin was absent.
  //
  // THE STAGING, per D48: `rules-of-hooks` is an ERROR — a conditional or out-of-order hook
  // is a real crash, never a style opinion, and this repo's whole methodology is "make the
  // failure a lint error that names the file" (see the ActivityIndicator and Alert.alert
  // bans below, both written for exactly that reason). `exhaustive-deps` is a WARN: it is
  // the largest defect class here, but turning it red today would block every commit on a
  // backlog nobody has read, and a mechanically "fixed" dependency array can change
  // behavior. A follow-up burns the warnings down per directory.
  plugins: ['react-hooks'],
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
      // The tracksheet RENDER lane (transition contract F3): component tests +
      // thin native-boundary mocks, excluded from the app tsconfig (same law
      // as *.spec.ts) and typed by the lane's own project. Jest env + the
      // spec-file relaxations; the mocks declare marker host elements, so the
      // typed JSX intrinsic check is off here.
      files: ['src/tracksheet/__render__/**/*.ts', 'src/tracksheet/__render__/**/*.tsx'],
      env: {
        jest: true,
      },
      parserOptions: {
        project: './tsconfig.tracksheet-render.json',
      },
      rules: {
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
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
        // `map-render-model.ts` was listed here until F2082 and does not exist
        // — deleted with the map work. A block scoped to a deleted file reads
        // as protection and provides none; scripts/check-lint-ban-inheritance.mjs
        // now fails on a stale target so the next one cannot linger.
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
    {
      // THE SKELETON LAW's RED contract (leg 6 — child-transition primitive §2.2 / wave-2
      // charter §5): sheet-scene bodies render their DECLARED foundation skeleton while
      // pending (SceneBodyReadyGate) and the shared Button primitive owns the squircle
      // loading affordance — a raw ActivityIndicator in a panel (or in Button.tsx) is the
      // spinner-first disease reintroduced. Banned at the import so a new spinner is a lint
      // error that names the file.
      files: ['src/overlays/panels/**/*.tsx', 'src/components/ui/Button.tsx'],
      rules: {
        // F2050: this ban USED TO be written as `no-restricted-syntax`, and it was DEAD —
        // ESLint REPLACES a rule's options when a later `overrides` entry configures the
        // same rule, and the F1960 override below matches `src/**/*.tsx`, i.e. every file
        // this entry covers. `--print-config` on a panel proved it: the only selector left
        // was F1960's. A raw ActivityIndicator in a panel was a lint error in the comments
        // and nowhere else. The ban lives on `no-restricted-imports` now — a DIFFERENT rule
        // from the one F1960 owns — so the collision is not merely fixed, it is unavailable:
        // no future selector added to `no-restricted-syntax` can silently erase it.
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: 'react-native',
                importNames: ['Modal', 'ActivityIndicator'],
                message:
                  'Use OverlayModalSheet (the standard modal surface) instead of the native Modal; ' +
                  'and no spinners in sheet-scene bodies — pending content renders the declared ' +
                  'foundation skeleton (SceneBodyReadyGate), button loading is the SquircleSpinner ' +
                  'via the shared Button primitive.',
              },
            ],
          },
        ],
      },
    },
    {
      // F1960: "what do I call this user" was hand-rolled SEVEN times before
      // user-display-name.ts collapsed it to one resolver that checks `isDeleted`
      // FIRST — a hand-rolled `displayName?.trim() || username?.trim() || fallback`
      // skips that branch and mislabels a deleted account as a nameless live one.
      // Ban the shape at the syntax level (not just the import) so a caller can't
      // silently re-derive the same three lines instead of importing the resolver.
      // Excluded: the resolver's own module (it must contain this exact expression)
      // and its spec.
      //
      // F3700 (2026-08-06): THE LOCK WAS SHAPED LIKE THE COPIES IT WAS BUILT
      // FROM, NOT LIKE THE RULE. The first selector requires `||` AND `.trim()`
      // — but user-display-name.ts's own header records that the six originals
      // split on exactly that axis, "half the copies used `??` (which keeps an
      // empty string) where the other half used `||`". The ban was written
      // against the half that happened to be in front of it, and five chains
      // lived on in the dialect it could not see — one of them restoring the
      // very `'?'` fallback F934(a) says was eliminated. The `??` and
      // bare-member dialects are added HERE, in the SAME block: a second
      // `no-restricted-syntax` block would REPLACE this one for any file it
      // matched rather than add to it (F2050), so every ban this door has must
      // live in one array.
      //
      // The two exclusions on the `??` selector are not softenings, they are
      // the boundary of the rule. `me.displayName ?? ''` / `?? null` in
      // EditProfilePanel initialises a FORM FIELD from your own profile — it
      // produces an absent value, not a label, and there is no name to get
      // wrong. And `creator.username ?? resolvePollCreatorName(creator)`
      // already delegates to a resolver on the right, which is the thing this
      // rule is asking for; a call on the right is compliance, not a chain.
      files: ['src/**/*.ts', 'src/**/*.tsx'],
      excludedFiles: ['src/utils/user-display-name.ts', 'src/utils/user-display-name.spec.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector:
              "LogicalExpression[operator='||'] CallExpression[callee.property.name='trim'][callee.object.property.name=/^(displayName|username)$/]",
            message:
              'Hand-rolled display-name fallback chain. Use resolveUserDisplayName(user, fallback) from utils/user-display-name.ts — it checks isDeleted first, which a `displayName?.trim() || username?.trim() || ...` chain silently skips.',
          },
          {
            // The `??` dialect. Same defect, different operator — and worse,
            // because `??` also keeps a whitespace-only name.
            selector:
              "LogicalExpression[operator='??']:not([right.raw=\"''\"]):not([right.raw='null']):not([right.raw='\"\"']):not([right.type='CallExpression']) > MemberExpression.left[property.name=/^(displayName|username)$/]",
            message:
              'Hand-rolled display-name fallback chain in the `??` dialect. Use resolveUserDisplayName(user, fallback) — or resolveUserHandleLabel(user, fallback) where the HANDLE is the point — from utils/user-display-name.ts. `??` skips the isDeleted branch AND keeps a whitespace-only name, so a deleted account renders as a nameless live one and a blank username renders as blank.',
          },
          {
            // The bare-member `||` dialect: `profile?.displayName ||
            // profile?.username || ...`, i.e. the same chain without the
            // `.trim()` calls the first selector keys on.
            selector:
              "LogicalExpression[operator='||'] > ChainExpression.left[expression.property.name=/^(displayName|username)$/]",
            message:
              'Hand-rolled display-name fallback chain (no `.trim()`, so the first selector misses it). Use resolveUserDisplayName(user, fallback) from utils/user-display-name.ts — it checks isDeleted first and trims.',
          },
        ],
      },
    },
  ],
  rules: {
    // F808: see the staging note at the top of this file. A second top-level `rules` key
    // would SILENTLY WIN over an earlier one (duplicate object key) — which is exactly how
    // the first attempt at this landed a registered plugin with zero active rules, and
    // `eslint --print-config` reported `{}` while everything looked configured. One `rules`
    // block, here.
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    // Mobile-specific rules
    '@typescript-eslint/no-explicit-any': 'warn',
    // THE STANDARD MODAL SURFACE (owner spec, 2026-07-08): every modal renders
    // through OverlayModalSheet (AppModalHost / showAppModal / announceFailureIfOnline;
    // `prompt` covers Alert.prompt flows). The native centered alert and native
    // <Modal> are banned so the standard can't silently erode — an Alert.alert
    // regressed in within a day of the migration; this rule is the door lock.
    'no-restricted-properties': [
      'error',
      {
        object: 'Alert',
        property: 'alert',
        message:
          'Use showAppModal / announceFailureIfOnline (the standard modal surface) instead of Alert.alert.',
      },
      {
        object: 'Alert',
        property: 'prompt',
        message:
          'Use showAppModal with the `prompt` field (the standard modal surface) instead of Alert.prompt.',
      },
    ],
    // F2050: this was a top-level `no-restricted-syntax` selector, and the F1960 override
    // (files: `src/**/*.ts(x)`) replaced it for the ENTIRE app — the native-Modal ban was
    // dead everywhere it mattered. Same rederivation as the panels entry above: an IMPORT
    // ban belongs on `no-restricted-imports`, which nothing else in this file configures
    // for src, so the two bans can no longer overwrite each other.
    //
    // KNOWN, DELIBERATE GAP: the decision-layer override sets its own
    // `no-restricted-imports` for four Node-pure modules, which replaces this one there.
    // Harmless — that override bans `react-native` outright, which strictly subsumes
    // banning one of its named exports.
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: 'react-native',
            importNames: ['Modal'],
            message:
              'Use OverlayModalSheet (the standard modal surface) instead of the native Modal.',
          },
        ],
      },
    ],
  },
};
