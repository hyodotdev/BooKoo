import type {Config} from '@jest/types';

// Money is stored in integer minor units and every timestamp in the repo is a
// UTC epoch-millis number, but calendar bucketing (a ledger is grouped by day)
// is done in the user's zone. Pin the test zone so those buckets are stable.
process.env.TZ = 'Asia/Seoul';

/**
 * Packages that ship untranspiled ESM/Flow and therefore must NOT be ignored by
 * the transformer. These are prefixes: `react-native` also covers every
 * `react-native-*` package, `expo` covers `expo-*`, `@react-native` covers
 * `@react-native-community` / `@react-native-seoul` / `@react-native-google-signin`,
 * and `@expo` covers `@expo-google-fonts`.
 *
 * Keep this list matched to what is actually in package.json — a stale entry is
 * harmless, but a missing one shows up as a confusing
 * "SyntaxError: Cannot use import statement outside a module".
 */
const TRANSFORMED_NODE_MODULES = [
  '.pnpm',
  '(jest-)?react-native', // + react-native-{svg,mmkv,gesture-handler,reanimated,worklets,keyboard-controller,edge-to-edge,safe-area-context,screens,web,error-boundary}
  '@react-native', // + @react-native-community, @react-native-seoul/*, @react-native-google-signin/*
  'expo(nent)?', // + expo-*
  '@expo(nent)?', // + @expo/vector-icons, @expo/match-media, @expo/react-native-action-sheet
  '@expo-google-fonts',
  'react-navigation',
  '@react-navigation',
  '@unimodules',
  'unimodules',
  'native-base',
  'cpk-ui',
  '@cpk-ui',
  'kstyled',
  'convex',
  'convex-helpers',
  '@convex-dev',
  '@noble',
  '@shopify', // flash-list
  'i18n-js',
  'jose',
  'immer',
  'zustand',
];

export default async (): Promise<Config.InitialOptions> => {
  return {
    // https://github.com/jefflau/jest-fetch-mock#to-setup-for-all-tests
    automock: false,
    resetMocks: false,
    preset: 'jest-expo',
    transform: {
      '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
    },
    transformIgnorePatterns: [
      `/node_modules/(?!(${TRANSFORMED_NODE_MODULES.join('|')}))`,
      '/node_modules/react-native-reanimated/plugin/',
      '/node_modules/@react-native/babel-preset/',
    ],
    modulePaths: ['<rootDir>'],
    moduleDirectories: ['node_modules'],
    testMatch: ['**/__tests__/**/*.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
    moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'svg', 'png', 'json'],
    testPathIgnorePatterns: [
      '/node_modules/',
      '<rootDir>/BooKooLegacy/',
      '<rootDir>/android/',
      '<rootDir>/ios/',
      // Agent worktrees nested in the checkout run their own suites.
      '<rootDir>/.claude/',
    ],
    modulePathIgnorePatterns: [
      // Private QA package backups must never shadow the installed dependency.
      '<rootDir>/.local/',
      '<rootDir>/build/',
      '<rootDir>/node_modules/',
      '<rootDir>/.history/',
      '<rootDir>/BooKooLegacy/',
      '<rootDir>/.claude/',
    ],
    moduleNameMapper: {
      // tsconfig.json `paths` — keep these three in sync with tsconfig.
      '^~/(.*)$': '<rootDir>/src/$1',
      '^@convex/(.*)$': '<rootDir>/convex/$1',
      '^@shared/(.*)$': '<rootDir>/shared/$1',
      // Assets. The template pointed `\.svg` at a file that never existed.
      '\\.svg$': '<rootDir>/__mocks__/svgMock.js',
      '.+\\.(css|style|less|sass|scss|png|jpg|ttf|woff|woff2)$': 'babel-jest',
      // The template mapped this at `.ts`; the manual mock is `.tsx`.
      '^convex/react$': '<rootDir>/__mocks__/convex/react.tsx',
      '^expo-iap$': '<rootDir>/__mocks__/expo-iap.ts',
      '^react-native-google-mobile-ads$':
        '<rootDir>/__mocks__/react-native-google-mobile-ads.tsx',
      '^react-native-worklets$': '<rootDir>/__mocks__/react-native-worklets.js',
      '^react-native-reanimated$':
        '<rootDir>/__mocks__/react-native-reanimated.js',
    },
    setupFiles: [
      '<rootDir>/test/testSetup.ts',
      './node_modules/react-native-gesture-handler/jestSetup.js',
    ],
    cacheDirectory: '.jest/cache',
    setupFilesAfterEnv: ['<rootDir>/test/testSetupAfterEnv.ts'],
    haste: {
      defaultPlatform: 'ios',
      platforms: ['android', 'ios', 'native'],
    },
    collectCoverageFrom: [
      'src/**/*.{ts,tsx}',
      'app/**/*.{ts,tsx}',
      'shared/**/*.{ts,tsx}',
      '!**/*.d.ts',
      '!**/_generated/**',
      '!**/node_modules/**',
    ],
    // Under `.jest/` on purpose: `.gitignore` already ignores `.jest`, so a
    // `--coverage` run never leaves an untracked directory behind.
    coverageDirectory: '<rootDir>/.jest/coverage',
    coverageReporters: ['text-summary', 'lcov'],
    coveragePathIgnorePatterns: [
      '/node_modules/',
      '/convex/_generated/',
      '/BooKooLegacy/',
    ],
    // Avoid a watchman dependency in CI/sandbox environments.
    watchman: false,
  };
};
