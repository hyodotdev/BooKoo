import {readFileSync} from 'node:fs';
import {join} from 'node:path';

type PackageManifest = {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

const manifest: PackageManifest = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
);

const ownershipGroups: readonly (readonly [string, readonly string[]])[] = [
  [
    'Convex data, auth, bounded work and server security',
    [
      '@convex-dev/auth',
      '@convex-dev/rate-limiter',
      '@convex-dev/workpool',
      '@noble/hashes',
      'convex',
      'convex-helpers',
      'jose',
      '@auth/core',
      '@oslojs/crypto',
      '@oslojs/encoding',
      'oslo',
    ],
  ],
  [
    'Free/Pro subscriptions and ads — docs/product/MONETIZATION.md',
    [
      'react-native-google-mobile-ads',
      'unity-levelplay-mediation',
      'expo-iap',
    ],
  ],
  [
    'Expo SDK 57 runtime, native config and lifecycle',
    [
      'expo',
      'expo-application',
      'expo-asset',
      'expo-build-properties',
      'expo-constants',
      'expo-device',
      'dotenv',
      'dotenv-expand',
      'expo-file-system',
      'expo-font',
      'expo-linking',
      'expo-observe',
      'expo-router',
      'expo-screen-orientation',
      'expo-splash-screen',
      'expo-status-bar',
      'expo-system-ui',
    ],
  ],
  [
    'Over-the-air updates through Codemagic Patch — scripts/ota-release.zsh',
    ['@codemagic/react-native-patch'],
  ],
  [
    'Authentication, app lock and provider hand-off',
    [
      '@react-native-google-signin/google-signin',
      '@react-native-seoul/kakao-login',
      '@react-native-seoul/naver-login',
      'expo-apple-authentication',
      'expo-crypto',
      'expo-local-authentication',
      'expo-secure-store',
      'expo-web-browser',
    ],
  ],
  [
    'Entry capture, receipt media and sharing',
    [
      '@react-native-community/datetimepicker',
      'expo-clipboard',
      'expo-haptics',
      'expo-image',
      'expo-image-manipulator',
      'expo-image-picker',
      'expo-location',
      'expo-media-library',
      'expo-sharing',
      'expo-maps',
      'react-native-play-install-referrer',
    ],
  ],
  [
    // The two peers are the SDK's, not BooKoo's. BooKoo stores through MMKV and
    // reads connectivity from Convex; Layers looks for async-storage to keep an
    // install's identity across launches (without it every launch is a new
    // anonymous_id and the numbers are worthless) and netinfo to flush its queue
    // when the device comes back online.
    'Growth attribution and the install-to-revenue loop — docs/release/SHIPATON_2026.md',
    [
      '@layers/expo',
      '@react-native-async-storage/async-storage',
      '@react-native-community/netinfo',
    ],
  ],
  [
    'Notifications, localization and deterministic date handling',
    ['date-fns', 'expo-localization', 'expo-notifications', 'i18n-js'],
  ],
  [
    'Design system, navigation, accessibility and interaction',
    [
      '@expo/match-media',
      '@expo/react-native-action-sheet',
      '@expo/vector-icons',
      'cpk-ui',
      'expo-linear-gradient',
      'kstyled',
      'react-native-edge-to-edge',
      'react-native-error-boundary',
      'react-native-gesture-handler',
      'react-native-keyboard-controller',
      'react-native-pager-view',
      'react-native-reanimated',
      'react-native-safe-area-context',
      'react-native-screens',
      'react-native-svg',
      'react-native-worklets',
      'babel-plugin-kstyled',
    ],
  ],
  [
    'Paginated lists and bounded client state',
    ['@shopify/flash-list', 'react-native-mmkv', 'zustand'],
  ],
  [
    'React Native application and web compatibility',
    ['react', 'react-dom', 'react-native', 'react-native-web'],
  ],
  [
    'TypeScript, Babel, lint, formatting and commit policy',
    [
      '@babel/core',
      '@commitlint/cli',
      '@commitlint/config-conventional',
      '@types/jest',
      '@types/node',
      '@types/react',
      '@typescript-eslint/eslint-plugin',
      '@typescript-eslint/parser',
      'commitlint-plugin-function-rules',
      'eslint',
      'eslint-config-expo',
      'eslint-config-prettier',
      'eslint-plugin-i18n-json',
      'expo-doctor',
      'patch-package',
      'prettier',
      'ts-node',
      'typescript',
    ],
  ],
  [
    'Jest Expo behavior and accessibility regression tests',
    [
      '@testing-library/react-native',
      'jest',
      'jest-expo',
      'react-test-renderer',
    ],
  ],
  [
    'One-time migration receipt thumbnail generation',
    ['sharp'],
  ],
];

const owners = new Map<string, string>();
const duplicates: string[] = [];

for (const [owner, packages] of ownershipGroups) {
  for (const packageName of packages) {
    if (owners.has(packageName)) duplicates.push(packageName);
    owners.set(packageName, owner);
  }
}

const installed = new Set([
  ...Object.keys(manifest.dependencies),
  ...Object.keys(manifest.devDependencies),
]);
const missingOwners = [...installed].filter((name) => !owners.has(name)).sort();
const staleOwners = [...owners.keys()]
  .filter((name) => !installed.has(name))
  .sort();

if (
  duplicates.length > 0 ||
  missingOwners.length > 0 ||
  staleOwners.length > 0
) {
  const details = [
    duplicates.length > 0 ? `duplicate owners: ${duplicates.join(', ')}` : '',
    missingOwners.length > 0
      ? `unowned installed packages: ${missingOwners.join(', ')}`
      : '',
    staleOwners.length > 0
      ? `owners for absent packages: ${staleOwners.join(', ')}`
      : '',
  ].filter((line) => line !== '');

  throw new Error(
    `dependency ownership verification failed:\n${details.join('\n')}`,
  );
}

process.stdout.write(
  `dependencies: ${installed.size} direct packages have an explicit owner\n`,
);
