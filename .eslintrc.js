// ESLint 8 legacy (.eslintrc) config — kept on purpose.
// `.ncurc.json` rejects `eslint` and `typescript` bumps so this format and
// TS 6.0.x stay pinned together. Do not "upgrade" to flat config piecemeal.
const path = require('path');

// Every React Compiler / react-hooks rule that `eslint-config-expo` turns on.
// Server-side (`convex/`) and isomorphic (`shared/`) code is not React, so the
// whole family is switched off there rather than one rule at a time.
const REACT_HOOKS_RULES = [
  'react-hooks/rules-of-hooks',
  'react-hooks/exhaustive-deps',
  'react-hooks/static-components',
  'react-hooks/use-memo',
  'react-hooks/preserve-manual-memoization',
  'react-hooks/incompatible-library',
  'react-hooks/immutability',
  'react-hooks/globals',
  'react-hooks/refs',
  'react-hooks/set-state-in-effect',
  'react-hooks/error-boundaries',
  'react-hooks/purity',
  'react-hooks/set-state-in-render',
  'react-hooks/unsupported-syntax',
  'react-hooks/gating',
];

const off = (rules) =>
  rules.reduce((acc, rule) => {
    acc[rule] = 'off';

    return acc;
  }, {});

module.exports = {
  root: true,
  extends: ['expo', 'prettier', 'plugin:i18n-json/recommended'],
  // `.eslintignore` carries the full list; these are repeated here so editors
  // and any invocation from a subdirectory still skip generated Convex code.
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'ios/',
    'android/',
    '.expo/',
    'convex/_generated/',
    'BooKooLegacy/',
  ],
  rules: {
    'eslint-comments/no-unlimited-disable': 0,
    'eslint-comments/no-unused-disable': 0,
    // BINDING RULE: `any` is banned repo-wide. Widen a type or write the
    // generic — never reach for `any`, and never `as any` on a typed route
    // string or an i18n key.
    '@typescript-eslint/no-explicit-any': 'error',
    'no-console': ['warn', {allow: ['warn', 'error']}],
    // A native alert without explicit buttons gets an "OK" in the system
    // language on iOS and in English on Android, not the app language. Use
    // `showNotice` from `~/utils/alert` or pass localized buttons.
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "CallExpression[callee.object.name='Alert'][callee.property.name='alert'][arguments.length<3]",
        message:
          'Pass localized buttons, or use showNotice from ~/utils/alert.',
      },
    ],
    // i18n: `assets/langs/ko.json` is the key SSOT; every other locale file
    // must have identical, ascending keys, and keys must be underscore-cased
    // (see `custom-syntax-validator.ts`). Static keys only — this only works
    // because no call site computes a key at runtime.
    'i18n-json/identical-keys': [
      2,
      {
        filePath: path.resolve('./assets/langs/ko.json'),
      },
    ],
    'i18n-json/sorted-keys': [
      2,
      {
        order: 'asc',
        indentSpaces: 2,
      },
    ],
    'i18n-json/valid-message-syntax': [
      2,
      {
        syntax: path.resolve('./custom-syntax-validator.ts'),
      },
    ],
  },
  overrides: [
    {
      // Convex functions run on the server: no React, no React Compiler, and
      // `./_generated/*` does not exist until `bunx convex dev` has run once,
      // so `import/no-unresolved` would fail a fresh clone.
      files: ['convex/**/*.ts', 'convex/**/*.tsx', 'convex/**/*.js'],
      rules: {
        ...off(REACT_HOOKS_RULES),
        'import/no-unresolved': 'off',
        // Convex's dashboard log stream is the only observability surface a
        // mutation has; Martie logs freely here.
        'no-console': 'off',
      },
    },
    {
      // `shared/` is isomorphic plain TypeScript imported by both the Expo app
      // and the Convex deployment (money helpers, date helpers, zod-ish
      // validators). Same reasoning as `convex/`, minus the console allowance.
      files: ['shared/**/*.ts', 'shared/**/*.tsx'],
      rules: off(REACT_HOOKS_RULES),
    },
    {
      // Module augmentation for kstyled / cpk-ui — the empty interface bodies
      // are the point: they widen the library's theme type with ours.
      files: ['src/styled.d.ts'],
      rules: {
        '@typescript-eslint/no-empty-object-type': 'off',
        '@typescript-eslint/no-empty-interface': 'off',
      },
    },
    {
      // Jest globals and test doubles.
      // NOTE for future overrides: bracketed expo-router route names
      // (`app/ledger/[id].tsx`) are glob character classes, so match the
      // directory (`app/ledger/*.tsx`), never the bracketed filename.
      files: ['test/**/*.ts', 'test/**/*.tsx', '__mocks__/**/*'],
      rules: {
        'no-console': 'off',
      },
    },
  ],
};
