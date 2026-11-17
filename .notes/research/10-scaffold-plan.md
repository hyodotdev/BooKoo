# 10 — Scaffold base (`expo-template-cpk`) + exact bootstrap plan for BooKoo

Research date: **2026-08-24**. All versions below were verified against the npm registry
(`npm view …`) or extracted from `expo@57.0.15/bundledNativeModules.json` on that date.

Sources inspected:

- `/Users/hyo/Github/crossplatformkorea/expo-template-cpk` (git HEAD `acbe604 fix(deps): pin react-test-renderer to 19.2.0`)
- npm package `expo-template-cpk@1.2.2` (published `2026-03-14T01:44:40.843Z`)
- `/Users/hyo/Github/hyodotdev/Martie` (Expo ~57.0.9, Convex, no social login)
- `/Users/hyo/Github/hyodotdev/FightingHows` (Expo ~57.0.9, Convex + Convex Auth + Kakao/Naver/Google/Apple) — **closest analog to BooKoo**
- `expo@57.0.15` `bundledNativeModules.json` (authoritative SDK 57 pin table)

---

## 1. The template: `crossplatformkorea/expo-template-cpk`

### 1.1 Full file tree (excluding `node_modules/`, `ios/`, `android/`, `dist/`, `.git/`)

```
.claude/commands/commit.md
.claude/commands/review-pr.md
.claude/settings.local.json
.cpk/expo
.env.sample
.eslintignore
.eslintrc.js
.github/workflows/ci.yml
.github/workflows/deploy.yml
.gitignore
.husky/commit-msg
.husky/pre-commit
.ncurc.json
.npmignore
.prettierrc.js
.vscode/cpk.code-snippets
.vscode/extensions.json
.vscode/launch.json
.vscode/settings.json
AGENTS.md
CONVENTION.md
README.md
__mocks__/expo-asset.ts
__mocks__/sentry-expo.ts
app.config.ts
app/_layout.tsx
app/details.tsx
app/index.tsx
assets/favicon.png
assets/icon.png
assets/icons/mask.png
assets/icons/mask@2x.png
assets/icons/mask@3x.png
assets/langs/en.json
assets/langs/ko.json
assets/langs/meta/en.json
assets/langs/meta/ko.json
assets/lotties/cpk_loading.json
assets/notification_icon.png
babel.config.js
bun.lock
commitlint.config.cjs
config.ts
custom-syntax-validator.ts
environment.d.ts
expo-env.d.ts
jest.config.ts
metro.config.js
package.json
public/.well-known/apple-app-site-association
public/.well-known/assetlinks.json
src/STRINGS.ts
src/apis/sample.ts
src/components/providers/ReducerProvider.tsx
src/components/providers/StateProvider.tsx
src/components/providers/index.tsx
src/components/uis/ListEmptyItem.tsx
src/icons.ts
src/shims/react-native-web-hooks.js
src/styled.d.ts
src/theme.ts
src/utils/constants.ts
src/utils/createCtx.tsx
src/utils/error.ts
test/app/details.test.tsx
test/app/index.test.tsx
test/src/apis/sample.test.ts
test/src/components/providers/ReducerProvider.test.tsx
test/src/components/providers/StateProvider.test.tsx
test/src/components/uis/ListEmptyItem.test.tsx
test/testSetup.ts
test/testSetupAfterEnv.ts
test/testUtils.tsx
tsconfig.json
```

### 1.2 What the *published* npm tarball actually contains

`expo-template-cpk@1.2.2` tarball file list (verified by downloading + `tar -tzf`) is the tree
above **minus**: `.gitignore`, `.npmignore`, `bun.lock`, `.claude/**`, `.jest/**`, `dist/**`,
`ios/`, `android/`. Excluded by `.npmignore`:

```
node_modules
.expo
.git
.jest
.claude
npm-debug.log
package-lock.json
bun.lock
dist
.DS_Store
ios
android
```

**Gotcha (confirmed):** npm strips any file literally named `.gitignore` from a published
tarball. `create-expo-app` compensates by renaming a file named `gitignore` → `.gitignore`
(its bundled code contains the comment *"gitignore` because npm ignores files named
`.gitignore` when …"*). **This template ships no `gitignore` file**, so a project scaffolded
from npm arrives with **no `.gitignore` at all**. You must copy one in manually.

### 1.3 `package.json` (verbatim)

```json
{
  "name": "expo-template-cpk",
  "description": "An Expo template with router by Cross-Platform Korea",
  "version": "1.2.2",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "start:prod": "STAGE=prod expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web",
    "lint": "eslint --ext .ts,.tsx,.js,.jsx src app test",
    "lint:i18n": "eslint --fix --ext .json --format node_modules/eslint-plugin-i18n-json/formatter.js assets/langs/",
    "fix:deps": "expo install --fix",
    "lint:all": "bun lint && bun lint:i18n",
    "build:web": "expo export --platform web",
    "typecheck": "tsc --noEmit",
    "test": "jest --runInBand",
    "eas:android": "eas build --profile preview --platform android",
    "eas:prod:android": "eas build --profile production --platform android",
    "eas:prod:ios": "eas build --profile production --platform ios"
  },
  "dependencies": {
    "@expo/match-media": "^0.4.0",
    "@expo/react-native-action-sheet": "^4.1.1",
    "@react-native-async-storage/async-storage": "2.2.0",
    "@react-native-community/datetimepicker": "8.6.0",
    "@shopify/flash-list": "2.0.2",
    "cpk-ui": "^0.5.5",
    "date-fns": "^4.1.0",
    "expo": "^55.0.0",
    "expo-constants": "~55.0.7",
    "expo-device": "~55.0.9",
    "expo-font": "~55.0.4",
    "expo-haptics": "~55.0.8",
    "expo-image": "~55.0.6",
    "expo-image-picker": "~55.0.12",
    "expo-linear-gradient": "~55.0.8",
    "expo-linking": "~55.0.7",
    "expo-localization": "~55.0.8",
    "expo-notifications": "~55.0.12",
    "expo-router": "~55.0.5",
    "expo-screen-orientation": "~55.0.8",
    "expo-sharing": "~55.0.11",
    "expo-splash-screen": "~55.0.10",
    "expo-status-bar": "~55.0.4",
    "expo-system-ui": "~55.0.9",
    "expo-tracking-transparency": "~55.0.8",
    "expo-updates": "~55.0.13",
    "expo-web-browser": "~55.0.9",
    "i18n-js": "4.5.1",
    "kstyled": "0.3.8",
    "lottie-react-native": "~7.3.5",
    "react": "19.2.0",
    "react-dom": "19.2.0",
    "react-native": "0.83.2",
    "react-native-error-boundary": "^3.1.0",
    "react-native-gesture-handler": "~2.30.0",
    "react-native-modal": "^13.0.2",
    "react-native-parsed-text": "^0.0.22",
    "react-native-reanimated": "4.2.1",
    "react-native-safe-area-context": "~5.6.2",
    "react-native-screens": "~4.23.0",
    "react-native-svg": "15.15.3",
    "react-native-tab-view": "^4.2.2",
    "react-native-web": "^0.21.2",
    "react-native-web-lottie": "^1.4.4",
    "react-native-webview": "13.16.0",
    "react-native-worklets": "0.7.2"
  },
  "devDependencies": {
    "@babel/core": "^7.28.6",
    "@commitlint/cli": "^20.3.1",
    "@commitlint/config-conventional": "^20.3.1",
    "@testing-library/react-native": "^13.3.3",
    "@types/jest": "29.5.14",
    "@types/react": "~19.2.10",
    "ajv": "^8.17.1",
    "babel-jest": "^30.2.0",
    "babel-plugin-kstyled": "0.3.8",
    "commitlint-plugin-function-rules": "^4.3.1",
    "dotenv-cli": "^11.0.0",
    "eslint": "^8.57.0",
    "eslint-config-expo": "~55.0.0",
    "eslint-config-prettier": "^10.1.8",
    "eslint-plugin-i18n-json": "^4.0.1",
    "eslint-plugin-jest": "^29.12.1",
    "eslint-plugin-prettier": "^5.5.5",
    "jest": "~29.7.0",
    "jest-expo": "~55.0.9",
    "jest-fetch-mock": "^3.0.3",
    "react-test-renderer": "19.2.0",
    "prettier": "^3.8.0",
    "ts-jest": "^29.4.6",
    "ts-node": "^10.9.2",
    "typescript": "~5.9.2"
  },
  "publishConfig": {"access": "public"},
  "license": "MIT"
}
```

Note: `package.json` has **no `files` field** and **no `packageManager` field**, and the
`pre-commit` husky hook calls `bun lint:ci` — a script that **does not exist** in
`package.json` (it defines `lint:all`, not `lint:ci`). That hook is broken as shipped.

### 1.4 `app.config.ts`

Placeholder-heavy. Key facts:

- Imports `version` from `./package.json`; uses `dotenv` + `dotenv-expand` gated on `process.env.STAGE`.
- `const DEEP_LINK_URL = '[firebaseAppId].web.app';` — literal placeholder.
- `name: 'myapp'`, `scheme: 'myapp'`, `slug: 'myapp-slug'`, `platforms: ['ios','android','web']`.
- `newArchEnabled: true`, `orientation: 'default'`, `userInterfaceStyle: 'automatic'`.
- `locales: {ko: './assets/langs/meta/ko.json', en: './assets/langs/meta/en.json'}`.
- `experiments: {typedRoutes: true}`.
- Plugins: `@react-native-community/datetimepicker`, `expo-web-browser`, `expo-router`,
  `expo-tracking-transparency`, `expo-localization`, `expo-image`, `expo-sharing`,
  `['expo-font', {fonts: [cpk.ttf, Pretendard-Bold.otf, Pretendard-Regular.otf, Pretendard-Thin.otf]}]`
  (all resolved from `node_modules/cpk-ui/components/uis/Icon/`),
  `['expo-splash-screen', {image:'./assets/icon.png', backgroundColor:'#EFEFEF', dark:{backgroundColor:'#232323'}, imageWidth:200}]`.
- `extra: {ROOT_URL, expoProjectId, firebaseWebApiKey}` from `process.env`.
- `ios.bundleIdentifier: 'io.myapp'`, `ios.supportsTablet: true`,
  `ios.entitlements: {'com.apple.developer.applesignin': ['Default']}`,
  `ios.infoPlist: {CFBundleAllowMixedLocalizations: true}`,
  `ios.associatedDomains: ['applinks:[firebaseAppId].web.app']`.
- `android.package: 'io.myapp'`, `android.userInterfaceStyle: 'automatic'`, permissions
  `RECEIVE_BOOT_COMPLETED, CAMERA, CAMERA_ROLL, READ_EXTERNAL_STORAGE, WRITE_EXTERNAL_STORAGE, NOTIFICATIONS, USER_FACING_NOTIFICATIONS`, plus an `intentFilters` App Links entry.
- `web: {bundler: 'metro', favicon: './assets/favicon.png'}`.

### 1.5 `babel.config.js` — **BROKEN for Reanimated 4**

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'babel-plugin-kstyled',
      'react-native-reanimated/plugin',
    ],
  };
};
```

`react-native-reanimated/plugin` was **removed in Reanimated 4** (it moved to
`react-native-worklets/plugin`). Both Martie and FightingHows already use the corrected form:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['babel-plugin-kstyled', {debug: false, strict: true}],
      // Reanimated v4 moved its Babel plugin into react-native-worklets.
      // Must stay last.
      'react-native-worklets/plugin',
    ],
  };
};
```

### 1.6 `metro.config.js`

```js
const path = require('path');
const {getDefaultConfig} = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('cjs', 'mjs');
// Replaces react-native-web-hooks (uses findDOMNode, removed in React 19) on web only
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' &&
      (moduleName === 'react-native-web-hooks' ||
       moduleName === 'react-native-web-hooks/build/hooks')) {
    return {filePath: path.resolve(__dirname, 'src/shims/react-native-web-hooks.js'), type: 'sourceFile'};
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
```

Why it exists: `cpk-ui@0.7.0` has a hard `dependencies` entry on `react-native-web-hooks@^3.0.2`,
which calls React's removed `findDOMNode`. Three known handlings:
- template → metro `resolveRequest` shim (`src/shims/react-native-web-hooks.js`, exports
  `useActive`, `useFocus`, `useHover`, `useDimensions`, `useScaledSize`)
- Martie → `patchedDependencies: {"react-native-web-hooks@3.0.2": "bun-patches/react-native-web-hooks@3.0.2.patch"}`
- FightingHows → ignores it entirely (`platforms: ['ios','android']`, web never bundled). Its
  `metro.config.js` is just `getDefaultConfig` + `sourceExts.push('cjs','mjs')`.

### 1.7 `tsconfig.json` (template — stale)

`extends: "expo/tsconfig.base"`; `module: "es2015"`, `moduleResolution: "Bundler"`,
`target: "es2020"`, `lib: ["es2017","dom"]`, `jsx: "react-jsx"`, `strict: true`,
`noUnusedLocals: false`, `experimentalDecorators`/`emitDecoratorMetadata` on,
`typeRoots: ["expo-router/ts-declarations","./@types","./node_modules/@types"]`,
`paths: {"@/*": ["./*"]}`, a `plugins: [{name:"typescript-styled-plugin", lint:{validProperties:[…]}}]`
entry (leftover from styled-components, irrelevant to kstyled), an odd top-level `"jest"` key,
and `"files": ["environment.d.ts","src/styled.d.ts"]`.

FightingHows' tsconfig is the modern shape to copy:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "jsx": "react-jsx",
    "paths": {"~/*": ["./src/*"], "@convex/*": ["./convex/*"]}
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts", "src/styled.d.ts"],
  "exclude": ["node_modules", "dist", "android", "ios", "convex/_generated"]
}
```

### 1.8 `jest.config.ts`

```ts
import type {Config} from '@jest/types';
process.env.TZ = 'Asia/Seoul';
export default async (): Promise<Config.InitialOptions> => ({
  automock: false,
  resetMocks: false,
  preset: 'jest-expo',
  transform: {'^.+\\.(js|jsx|ts|tsx)$': 'babel-jest'},
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|cpk-ui|@cpk-ui)',
  ],
  modulePaths: ['<rootDir>'],
  moduleDirectories: ['node_modules'],
  testMatch: ['**/__tests__/**/*.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
  moduleFileExtensions: ['js','ts','tsx','svg','png','json'],
  modulePathIgnorePatterns: ['<rootDir>/build/','<rootDir>/node_modules/','<rootDir>/.history/'],
  moduleNameMapper: {
    '\\.svg': '<rootDir>/__mocks__/svgMock.js',
    '.+\\.(css|style|less|sass|scss|png|jpg|ttf|woff|woff2)$': 'babel-jest',
  },
  setupFiles: ['<rootDir>/test/testSetup.ts', './node_modules/react-native-gesture-handler/jestSetup.js'],
  cacheDirectory: '.jest/cache',
  setupFilesAfterEnv: ['./test/testSetupAfterEnv.ts'],
  haste: {defaultPlatform: 'ios', platforms: ['android','ios','native']},
  coveragePathIgnorePatterns: ['/node_modules/'],
});
```

**Bug:** `moduleNameMapper['\\.svg']` points at `<rootDir>/__mocks__/svgMock.js`, which
**does not exist** in the template. Add it or drop the mapping.

### 1.9 `config.ts`

```ts
import Constants from 'expo-constants';
const extra = Constants?.expoConfig?.extra;
export const ROOT_URL = extra?.ROOT_URL;
export const expoProjectId = extra?.expoProjectId;
export const appVersion = Constants?.expoConfig?.version;
```

### 1.10 `environment.d.ts`

Ambient module declarations for `*.svg` (→ `IconType` from `./src/types`, a module that does
**not exist** in the template), `*.json` (→ `Record<string, unknown>`), `*.png` (→ `number`).

### 1.11 `custom-syntax-validator.ts`

```ts
module.exports = (message, key) => {
  if (key.includes('-')) {
    throw new SyntaxError('Key must use underscore(_) instead of hyphen(-)!');
  }
};
```

Wired into eslint via `i18n-json/valid-message-syntax`. Enforces underscore-only i18n keys.
(Note: the template's own `en.json` uses camelCase `seeDetails`, which passes.)

### 1.12 ESLint setup

`.eslintrc.js` (eslintrc, **not** flat config):

```js
const path = require('path');
module.exports = {
  root: true,
  extends: ['expo', 'prettier', 'plugin:i18n-json/recommended'],
  plugins: ['prettier'],
  rules: {
    'eslint-comments/no-unlimited-disable': 0,
    'eslint-comments/no-unused-disable': 0,
    'i18n-json/identical-keys': [2, {filePath: path.resolve('./assets/langs/ko.json')}],
    'i18n-json/sorted-keys': [2, {order: 'asc', indentSpaces: 2}],
    'i18n-json/valid-message-syntax': [2, {syntax: path.resolve('./custom-syntax-validator.ts')}],
  },
};
```

`.eslintignore`: `**/*.js`, `node_modules/`, `assets/langs/ios/`, `*.d.ts`.
`.prettierrc.js`: `{trailingComma:'all', arrowParens:'always', singleQuote:true, jsxSingleQuote:false, bracketSpacing:false}` — identical in template, Martie, and FightingHows.

### 1.13 commitlint + husky

`commitlint.config.cjs` extends `@commitlint/config-conventional`, disables
`body-max-line-length`, and replaces it with a `commitlint-plugin-function-rules` rule
`function-rules/body-max-line-length` capping bodies at **500** chars **except** for
`chore(deps)` / `chore(deps-dev)` commits.

`.husky/commit-msg` → `npx commitlint --edit $1`
`.husky/pre-commit` → `bun lint:ci` + `bun lint:i18n` (**`lint:ci` script is missing**).

### 1.14 `__mocks__/`

- `__mocks__/expo-asset.ts` → `export default {loadSingleFontAsync: jest.fn()}`
- `__mocks__/sentry-expo.ts` → `export const Native = {captureException: jest.fn()}`
- **Missing**: `__mocks__/svgMock.js` referenced by `jest.config.ts`.

### 1.15 `test/`

- `test/testSetup.ts` — installs `jest-fetch-mock` as `global.fetch`; sets
  `global.__reanimatedWorkletInit`; `jest.mock('expo-router')`,
  `jest.mock('@expo/react-native-action-sheet')`, `expo-font` → `{useFonts: () => []}`,
  a full `expo-localization` mock (`getLocales()` returns `en`/`US`/`USD`),
  AsyncStorage jest mock, `NativeEventEmitter` mock, and
  `jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))`.
- `test/testSetupAfterEnv.ts` — `afterEach(cleanup)` + rethrow `unhandledRejection`.
- `test/testUtils.tsx` — `createTestElement(child, mockContext?, themeType?)` wraps in
  `RootProvider`; `createTestProps()`; `createMockNavigation()`; `TestSafeAreaProvider`.
- 6 test files: `test/app/index.test.tsx`, `test/app/details.test.tsx`,
  `test/src/apis/sample.test.ts`, `test/src/components/providers/{StateProvider,ReducerProvider}.test.tsx`,
  `test/src/components/uis/ListEmptyItem.test.tsx`. All are smoke "renders without crashing" tests.

### 1.16 What `src/` ships

| Path | Content |
|---|---|
| `src/STRINGS.ts` | `i18n-js` `new I18n({en, ko})`; `defaultLocale='en'`, `enableFallback=true`, `locale = getLocales()[0]?.languageTag ?? 'en'`. Exports `getLocale()`, `capitalize()`, and a **type-safe `t()`** whose param type is `NestedKeys<typeof en>` (recursive dotted-key union derived from `assets/langs/en.json`) with signature `t(param, mapObj?, locale?): string`. |
| `src/theme.ts` | `colors = {apple:'#000000', google:'#E04238', facebook:'#345997'}`; `light`/`dark` are **empty objects** typed `CpkThemeParams & any`; `export type CustomAppTheme = typeof light & CpkThemeParams`; `export const theme = {light, dark}`. |
| `src/styled.d.ts` | Augments `declare module 'kstyled' { interface DefaultTheme { bg; role; text; button; isPortrait?; isDesktop?; isTablet?; isMobile? } }` from `CustomAppTheme & CpkThemeBase`. |
| `src/icons.ts` | `import MASK from '../assets/icons/mask.png'; export const IC_MASK = MASK;` |
| `src/utils/constants.ts` | `LIST_CNT = 10`; `AsyncStorageKey = {Token:'token', DarkMode:'dark-mode'}`; `delayPressIn = 200`; `WEB_URL='https://hyochan.dev'`; `COMPONENT_WIDTH = 500`. |
| `src/utils/createCtx.tsx` | Generic `createCtx<A>()` returning `[useCtx, Provider]` with an undefined guard. |
| `src/utils/error.ts` | `handleErrorConsole(error): string` with `isErrorWithMessage`/`toErrorWithMessage`; Sentry calls commented out. |
| `src/apis/sample.ts` | `sample(body, signal?)` → `POST ${ROOT_URL}/sample`. Demo only. |
| `src/components/providers/index.tsx` | `RootProvider({initialThemeType, children})` = `CpkProvider(themeConfig={initialThemeType, customTheme: theme})` › `ErrorBoundary(FallbackComponent from react-native-error-boundary, onError=handleErrorConsole)` › `ActionSheetProvider`. |
| `src/components/providers/StateProvider.tsx` | `useState` demo context (`user`/`setUser`). |
| `src/components/providers/ReducerProvider.tsx` | `useReducer` demo context, `ActionType.SetUser = 'set-user'`. |
| `src/components/uis/ListEmptyItem.tsx` | Centered `<Icon name="QuestBoxFill" size={14} color={theme.text.disabled} />`. |
| `src/shims/react-native-web-hooks.js` | React-19-safe reimplementation (see §1.6). |

**There are NO `src/stores/` (zustand) files** despite `AGENTS.md` documenting the pattern —
the docs describe zustand+immer but neither package is a dependency. Same for `src/components/hooks/`
and `src/components/modals/`.

### 1.17 What `app/` ships

- `app/_layout.tsx` — reads `AsyncStorageKey.DarkMode` from AsyncStorage in an effect,
  falls back to `useColorScheme()`, renders `<ActivityIndicator/>` until resolved, then
  `GestureHandlerRootView` › `RootProvider` › `StatusBarBrightness` + `Layout`.
  `Layout` uses `useCPK()` for `assetLoaded`/`theme`, hides the splash, and renders a
  `<Stack>` with themed header + a `CustomPressable` `headerLeft` back button that on web
  falls back to `window.location.href = WEB_URL`. Content is width-capped at
  `COMPONENT_WIDTH` (500px) — a phone-only assumption, **wrong for the tablet requirement**.
  Also note `SplashScreen.hideAsync()` is called at module scope while
  `SplashScreen.preventAutoHideAsync()` is commented out.
- `app/index.tsx` — `SwitchToggle` toggling `themeType` + persisting `dark-mode` to
  AsyncStorage; a `Button` pushing `/details`.
- `app/details.tsx` — trivial `Typography.Body1`.

### 1.18 i18n assets

`assets/langs/en.json`, `ko.json` (identical key set: `details.title`, `home.seeDetails`,
`home.title`) and `assets/langs/meta/{en,ko}.json` (same content, consumed by
`app.config.ts` `locales:` for iOS `CFBundleLocalizations`).

### 1.19 CI / other

- `.github/workflows/ci.yml`: node 22.x + `oven-sh/setup-bun@v2` → `bun install --frozen-lockfile`
  → `bun lint:all` → `bun typecheck` → `rm -rf ./dist` → `bun run test --coverage --silent`.
- `.github/workflows/deploy.yml`: on release → `bun build:web` with `ROOT_URL`/`expoProjectId` secrets.
- `.ncurc.json`: `{"reject": ["typescript", "eslint"]}` — blocks TS and ESLint upgrades.
- `.cpk/expo`: marker file for `cpk-cli`. **The `cpk` npm package 404s** — not published.
- `.vscode/cpk.code-snippets`: a `cpk` snippet that still emits
  `import styled from '@emotion/native';` — stale, contradicts kstyled.
- `public/.well-known/apple-app-site-association` contains the placeholder
  `"appID": "[appleDevTeamId].com.crossplatformkorea"`.

---

## 2. Version gap: template vs. Martie / FightingHows

| Package | template 1.2.2 | Martie | FightingHows | SDK 57 pin (`bundledNativeModules`) | npm latest 2026-08-24 |
|---|---|---|---|---|---|
| `expo` | `^55.0.0` | `~57.0.9` | `~57.0.9` | — | **57.0.15** |
| `react-native` | `0.83.2` | `0.86.2` | `0.86.2` | `0.86.2` | — |
| `react` / `react-dom` | `19.2.0` | `19.2.3` | `19.2.3` | — | — |
| `expo-router` | `~55.0.5` | `~57.0.9` | `~57.0.9` | `~57.0.15` | 57.0.15 |
| `cpk-ui` | `^0.5.5` | `0.7.0` | `0.7.0` | — | **0.7.0** |
| `kstyled` | `0.3.8` | `0.4.1` | `0.4.1` | — | **0.4.1** |
| `babel-plugin-kstyled` | `0.3.8` | `0.4.1` | `0.4.1` | — | **0.4.1** |
| `react-native-reanimated` | `4.2.1` | `4.5.1` | `4.5.1` | `4.5.1` | — |
| `react-native-worklets` | `0.7.2` | `0.10.1` | `0.10.1` | `0.10.1` | — |
| `react-native-gesture-handler` | `~2.30.0` | `~2.32.0` | `~2.32.0` | `~2.32.0` | — |
| `react-native-safe-area-context` | `~5.6.2` | `~5.7.0` | `~5.7.0` | `~5.7.0` | — |
| `react-native-screens` | `~4.23.0` | `~4.26.0` | `~4.26.0` | `~4.26.0` | — |
| `react-native-svg` | `15.15.3` | `15.15.4` | `15.15.4` | `15.15.4` | 15.15.5 |
| `@react-native-community/datetimepicker` | `8.6.0` | `9.1.0` | — | `9.1.0` | — |
| `@shopify/flash-list` | `2.0.2` | `2.0.2` | `2.0.2` | `2.0.2` | 2.3.2 |
| `i18n-js` | `4.5.1` | `^4.5.3` | — | — | 4.5.3 |
| `date-fns` | `^4.1.0` | `^4.4.0` | `^4.4.0` | — | 4.4.0 |
| `typescript` | `~5.9.2` | `~6.0.3` | `~6.0.3` | — | 6.0.3 |
| `jest-expo` | `~55.0.9` | `~57.0.3` | `~57.0.3` | `~57.0.4` | — |
| `eslint-config-expo` | `~55.0.0` | `~57.0.1` | `~57.0.1` | `~57.0.1` | — |
| `react-test-renderer` | `19.2.0` | `19.2.3` | `19.2.3` | — | — |
| `prettier` | `^3.8.0` | `^3.9.6` | `^3.9.6` | — | 3.9.6 |
| `@commitlint/cli` | `^20.3.1` | `^21.2.1` | `^21.2.1` | — | — |
| `jest-fetch-mock` | `^3.0.3` | `^4.2.0` | — | — | 4.2.0 |

**Template only** (absent from both reference apps): `react-native-modal`, `react-native-tab-view`,
`react-native-parsed-text` (Martie keeps it), `react-native-web-lottie`, `lottie-react-native`,
`react-native-webview`, `expo-tracking-transparency`, `expo-updates`, `ts-jest`, `ajv`,
`eslint-plugin-i18n-json`, `eslint-plugin-jest`, `dotenv-cli`, `commitlint-plugin-function-rules`.

**Reference apps only** (absent from template — everything BooKoo needs): `convex`,
`@convex-dev/auth`, `zustand`, `react-native-mmkv`, `react-native-keyboard-controller`,
`react-native-edge-to-edge`, `expo-secure-store`, `expo-apple-authentication`, `expo-auth-session`,
`expo-crypto`, `expo-build-properties`, `expo-asset`, `expo-file-system`, `@expo/vector-icons`,
`@expo/metro-runtime`, `@backpackapp-io/react-native-toast`, `jose`, `immer`,
`@react-native-seoul/kakao-login`, `@react-native-seoul/naver-login`,
`@react-native-google-signin/google-signin`, `@react-native/metro-config`.

---

## 3. Bootstrap plan for `/Users/hyo/Github/hyodotdev/BooKoo`

### 3.1 Scaffold command

The `create-expo-app` route **does exist** and works:

```bash
bunx create-expo-app@4.0.0 BooKoo --template expo-template-cpk --no-install --yes
```

(`create-expo-app@4.0.0` help confirms `-t, --template [pkg]  NPM template to use: …`.
There is **no** `create-expo-template-cpk` / `create-cpk-app` CLI; the `cpk` npm package 404s.)

**But do not use it here**, for three reasons:
1. `/Users/hyo/Github/hyodotdev/BooKoo` is non-empty (`.git/`, `.gitignore`, `.notes/`,
   `BooKooLegacy/`) — `create-expo-app` wants to own the directory.
2. The published tarball has **no `.gitignore`** (§1.2).
3. The published tarball is SDK 55; every version has to be rewritten anyway.

**Recommended: copy from the local clone, which has `.gitignore`.**

```bash
# 0. sanity
cd /Users/hyo/Github/hyodotdev/BooKoo && git status --short

# 1. copy the template's tracked files, minus everything we discard in §3.3
rsync -av \
  --exclude '.git/' --exclude 'node_modules/' --exclude 'ios/' --exclude 'android/' \
  --exclude 'dist/' --exclude '.expo/' --exclude 'bun.lock' --exclude '.npmignore' \
  --exclude '.cpk/' --exclude '.claude/' \
  --exclude 'src/apis/' --exclude 'test/src/apis/' \
  --exclude 'src/components/providers/StateProvider.tsx' \
  --exclude 'src/components/providers/ReducerProvider.tsx' \
  --exclude 'test/src/components/providers/' \
  --exclude 'app/details.tsx' --exclude 'test/app/details.test.tsx' \
  --exclude '__mocks__/sentry-expo.ts' \
  --exclude 'src/shims/' \
  --exclude '.github/workflows/deploy.yml' \
  --exclude 'public/' \
  --exclude '.vscode/cpk.code-snippets' \
  --exclude 'assets/lotties/' \
  /Users/hyo/Github/crossplatformkorea/expo-template-cpk/ \
  /Users/hyo/Github/hyodotdev/BooKoo/

# 2. merge the legacy .gitignore additions
printf '\nBooKooLegacy/\n.env.local\nconvex/_generated/\n' >> /Users/hyo/Github/hyodotdev/BooKoo/.gitignore

# 3. write the package.json from §3.2, then
cd /Users/hyo/Github/hyodotdev/BooKoo && bun install

# 4. reconcile every native module against the SDK pin table
bunx expo install --fix
bunx expo-doctor

# 5. Convex
bunx convex dev --once      # creates convex/, convex.json, .env.local (CONVEX_DEPLOYMENT, EXPO_PUBLIC_CONVEX_URL)
bunx @convex-dev/auth       # Convex Auth init: writes convex/auth.ts, convex/auth.config.ts, convex/http.ts

# 6. first native build
bunx expo prebuild --no-install
bun ios
```

If you prefer the canonical scaffold anyway, do it out-of-tree and merge:

```bash
bunx create-expo-app@4.0.0 /tmp/bookoo-scaffold --template expo-template-cpk --no-install --yes
rsync -av --exclude 'node_modules/' /tmp/bookoo-scaffold/ /Users/hyo/Github/hyodotdev/BooKoo/
cp /Users/hyo/Github/crossplatformkorea/expo-template-cpk/.gitignore /Users/hyo/Github/hyodotdev/BooKoo/.gitignore
```

### 3.2 Target `package.json` — dependency block (ready to paste)

All native-module versions match `expo@57.0.15/bundledNativeModules.json` exactly, so
`expo install --fix` and `expo-doctor` are clean. Non-native packages are pinned to the
npm `latest` verified on 2026-08-24.

```json
{
  "name": "bookoo",
  "version": "1.0.0",
  "main": "expo-router/entry",
  "private": true,
  "license": "UNLICENSED",
  "engines": {"node": "^22.13.0 || >=24.3.0"},
  "packageManager": "bun@1.3.13",
  "dependencies": {
    "@backpackapp-io/react-native-toast": "0.15.1",
    "@convex-dev/auth": "0.0.95",
    "@expo/match-media": "0.4.0",
    "@expo/react-native-action-sheet": "4.1.1",
    "@expo/vector-icons": "15.1.1",
    "@react-native-google-signin/google-signin": "16.1.4",
    "@react-native-seoul/kakao-login": "6.0.4",
    "@react-native-seoul/naver-login": "5.0.1",
    "@shopify/flash-list": "2.0.2",
    "@shopify/react-native-skia": "2.6.2",
    "convex": "1.45.0",
    "cpk-ui": "0.7.0",
    "date-fns": "4.4.0",
    "expo": "57.0.15",
    "expo-apple-authentication": "~57.0.1",
    "expo-asset": "~57.0.13",
    "expo-auth-session": "~57.0.8",
    "expo-build-properties": "~57.0.13",
    "expo-constants": "~57.0.13",
    "expo-crypto": "~57.0.1",
    "expo-device": "~57.0.1",
    "expo-file-system": "~57.0.5",
    "expo-font": "~57.0.1",
    "expo-haptics": "~57.0.1",
    "expo-image": "~57.0.3",
    "expo-image-picker": "~57.0.12",
    "expo-linear-gradient": "~57.0.1",
    "expo-linking": "~57.0.7",
    "expo-localization": "~57.0.1",
    "expo-notifications": "~57.0.13",
    "expo-router": "~57.0.15",
    "expo-secure-store": "~57.0.1",
    "expo-sharing": "~57.0.14",
    "expo-splash-screen": "~57.0.7",
    "expo-status-bar": "~57.0.1",
    "expo-system-ui": "~57.0.2",
    "expo-updates": "~57.0.16",
    "expo-web-browser": "~57.0.2",
    "i18n-js": "4.5.3",
    "immer": "11.1.18",
    "jose": "6.2.10",
    "kstyled": "0.4.1",
    "react": "19.2.3",
    "react-dom": "19.2.3",
    "react-native": "0.86.2",
    "react-native-edge-to-edge": "1.8.1",
    "react-native-error-boundary": "3.1.0",
    "react-native-gesture-handler": "~2.32.0",
    "react-native-keyboard-controller": "1.21.9",
    "react-native-mmkv": "3.3.3",
    "react-native-reanimated": "4.5.1",
    "react-native-safe-area-context": "~5.7.0",
    "react-native-screens": "~4.26.0",
    "react-native-svg": "15.15.4",
    "react-native-web": "~0.21.2",
    "react-native-worklets": "0.10.1",
    "victory-native": "41.26.0",
    "zustand": "5.0.15"
  },
  "devDependencies": {
    "@auth/core": "0.41.3",
    "@babel/core": "^7.29.7",
    "@commitlint/cli": "^21.2.1",
    "@commitlint/config-conventional": "^21.2.0",
    "@react-native/metro-config": "0.86.0",
    "@testing-library/react-native": "^13.3.3",
    "@types/jest": "29.5.14",
    "@types/node": "^22",
    "@types/react": "~19.2.17",
    "@typescript-eslint/eslint-plugin": "^8.65.0",
    "@typescript-eslint/parser": "^8.65.0",
    "babel-plugin-kstyled": "0.4.1",
    "commitlint-plugin-function-rules": "^5.0.1",
    "dotenv-cli": "^11.0.0",
    "eslint": "^8.57.1",
    "eslint-config-expo": "~57.0.1",
    "eslint-config-prettier": "^10.1.8",
    "eslint-plugin-i18n-json": "^4.0.1",
    "eslint-plugin-prettier": "^5.5.6",
    "jest": "~29.7.0",
    "jest-expo": "~57.0.4",
    "oslo": "1.2.1",
    "prettier": "^3.9.6",
    "react-test-renderer": "19.2.3",
    "resend": "6.22.0",
    "ts-node": "^10.9.2",
    "typescript": "~6.0.3"
  },
  "expo": {
    "doctor": {
      "reactNativeDirectoryCheck": {
        "exclude": ["cpk-ui", "kstyled"]
      }
    }
  }
}
```

Deliberate inclusions / exclusions:

- `@auth/core@0.41.3` is a **hard peer** of `@convex-dev/auth@0.0.95`
  (`peerDependencies: {"@auth/core": "^0.41.1", convex: "^1.17.0", react: "^18.2.0 || ^19.0.0-0"}`).
  Martie carries it in `devDependencies`; FightingHows omits it and gets away with it because it
  only uses `ConvexCredentials`. **Email-OTP needs it** → keep it.
- `resend` + `oslo` back the Convex Auth email-OTP provider (Martie's exact combo).
- `react-native-mmkv` stays on **3.3.3**, not 4.x — v4 adds a hard peer on
  `react-native-nitro-modules` (`peerDependencies: {react:'*', 'react-native':'*', 'react-native-nitro-modules':'*'}`).
  Both reference apps are on `^3.3.3`; 3.3.3 is the last 3.x.
- `@shopify/flash-list` stays on **2.0.2** (the SDK 57 pin) even though 2.3.2 is on npm —
  `expo install --fix` would downgrade it and doctor would warn.
- `@react-native-async-storage/async-storage` is **dropped**. MMKV covers sync local state;
  `expo-secure-store` covers Convex Auth tokens. Re-add `2.2.0` only if a dependency demands it.
- `react-native-webview`, `react-native-modal`, `react-native-tab-view`, `lottie-react-native`,
  `react-native-web-lottie`, `react-native-parsed-text`, `expo-screen-orientation`,
  `expo-tracking-transparency`, `expo-sharing`(optional) are dropped — see §3.3.
- `react-native-web@~0.21.2` + `react-dom` retained only if web stays a target; see §3.4.

Add-later candidates (not in the base install):

| Need | Package | Verified version |
|---|---|---|
| Convex pagination/validator helpers | `convex-helpers` | `0.1.123` (peer `convex ^1.43.0`) |
| Native date picker for the ledger entry form | `@react-native-community/datetimepicker` | `9.1.0` (SDK 57 pin) |
| CSV/receipt export | `expo-sharing` `~57.0.14`, `expo-file-system` `~57.0.5` | SDK 57 pins |
| Push | `expo-notifications` `~57.0.13` (already included) | SDK 57 pin |

### 3.3 What to DELETE from the template

Hard deletes (dead demo code / wrong stack):

| Path | Why |
|---|---|
| `src/apis/sample.ts` | REST demo; Convex replaces all data fetching. |
| `test/src/apis/sample.test.ts` | tests the above. |
| `src/components/providers/StateProvider.tsx` | `useState` context demo; zustand replaces it. |
| `src/components/providers/ReducerProvider.tsx` | `useReducer` context demo; ditto. |
| `test/src/components/providers/StateProvider.test.tsx` | ditto. |
| `test/src/components/providers/ReducerProvider.test.tsx` | ditto. |
| `app/details.tsx` + `test/app/details.test.tsx` | placeholder route. |
| `__mocks__/sentry-expo.ts` | no Sentry in the stack. |
| `.vscode/cpk.code-snippets` | emits `import styled from '@emotion/native'` — contradicts kstyled. |
| `.github/workflows/deploy.yml` | Firebase-hosting web deploy; replace with `convex deploy` + EAS. |
| `public/.well-known/apple-app-site-association` | contains literal `[appleDevTeamId].com.crossplatformkorea`. |
| `public/.well-known/assetlinks.json` | same placeholder problem. |
| `.cpk/expo` | marker for `cpk-cli`, a package that does not exist on npm. |
| `.npmignore` | this is an app, not a published package. |
| `bun.lock` | regenerate from the new `package.json`. |
| `assets/lotties/cpk_loading.json` | only used with `lottie-react-native`/`react-native-web-lottie`, both dropped. |
| `src/utils/createCtx.tsx` | only consumer was the two demo providers. Delete unless a real context appears. |

Conditional deletes:

| Path | Condition |
|---|---|
| `src/shims/react-native-web-hooks.js` + the `resolveRequest` block in `metro.config.js` | delete if `platforms: ['ios','android']` (FightingHows model). Keep, or switch to Martie's `bun-patches/react-native-web-hooks@3.0.2.patch`, only if web ships. |
| `config.ts` | rewrite: drop `ROOT_URL`, keep `appVersion`; Convex URL comes from `process.env.EXPO_PUBLIC_CONVEX_URL`, not `Constants.expoConfig.extra`. |
| `environment.d.ts` | keep `*.png`/`*.json`; delete the `*.svg` block or create `src/types.ts` exporting `IconType` (currently a dangling import). |
| `.ncurc.json` | delete or empty the `reject` list — it blocks the TS 5.9 → 6.0.3 and ESLint upgrades we want. |

Must-rewrite (not delete):

| Path | Change |
|---|---|
| `babel.config.js` | `react-native-reanimated/plugin` → `react-native-worklets/plugin` (last), `babel-plugin-kstyled` → `['babel-plugin-kstyled', {debug:false, strict:true}]`. **Blocking for Reanimated 4.** |
| `app.config.ts` | replace every `myapp`/`io.myapp`/`[firebaseAppId]` placeholder; drop the `firebaseWebApiKey` extra; add plugins per §3.4. |
| `app/_layout.tsx` | remove the `COMPONENT_WIDTH = 500` width cap (kills tablet layout); replace AsyncStorage dark-mode with the MMKV `useThemePreference` pattern; add `ConvexAuthProvider`; `preventAutoHideAsync()` instead of the module-scope `hideAsync()`. |
| `src/theme.ts` | `light`/`dark` are `{}` typed `& any`. Give them real BooKoo tokens and drop the `any`. |
| `src/styled.d.ts` | adopt the FightingHows form, which also augments `cpk-ui`'s `CpkTheme`. |
| `src/utils/constants.ts` | `AsyncStorageKey` → MMKV `StorageKey`; delete `WEB_URL`/`COMPONENT_WIDTH`. |
| `tsconfig.json` | replace with the FightingHows shape (§1.7); drop `typescript-styled-plugin`, the stray `"jest"` key, `module: es2015`. |
| `jest.config.ts` | either create `__mocks__/svgMock.js` or delete the `'\\.svg'` mapping; bump `jest-expo` to `~57.0.4`. |
| `.husky/pre-commit` | calls `bun lint:ci`, a script that does not exist. Change to `bun lint:all` or add the script. |
| `package.json` scripts | add `convex`, `convex:deploy`, `check`, `typecheck` (FightingHows has all four); keep `lint`, `lint:i18n`, `lint:all`, `test`. |

### 3.4 `app.config.ts` plugin set to land on (from FightingHows, minus its app-specific bits)

```
'expo-router', 'expo-asset', 'expo-secure-store', 'expo-web-browser',
'expo-apple-authentication', './plugins/withKakaoProguard',
['@react-native-seoul/kakao-login', {kakaoAppKey}]              // gated on EXPO_PUBLIC_KAKAO_APP_KEY
['@react-native-seoul/naver-login', {urlScheme: 'bookoonaver'}] // dedicated scheme, NOT the app scheme
['@react-native-google-signin/google-signin', {iosUrlScheme: googleReversedClientId}] // gated on EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
['expo-image-picker', {photosPermission, cameraPermission}]
['expo-notifications', {icon, color}]
['expo-splash-screen', {image, imageWidth, resizeMode, backgroundColor, dark:{…}}]
['expo-font', {fonts: [Pretendard-*.otf…, 'node_modules/cpk-ui/components/uis/Icon/cpk.ttf']}]
['react-native-edge-to-edge', {android: {parentTheme:'Default', enforceNavigationBarContrast:false}}]
['expo-build-properties', {
   ios: {deploymentTarget: '16.4', useFrameworks: 'static'},
   android: {minSdkVersion: 24, compileSdkVersion: 36, targetSdkVersion: 36,
             kotlinVersion: '2.1.20', enableMinifyInReleaseBuilds: true,
             enableShrinkResourcesInReleaseBuilds: true,
             extraMavenRepos: ['https://devrepo.kakao.com/nexus/content/groups/public/']}}]
```

Plus (differs from FightingHows, which is phone-only): keep `ios.supportsTablet: true` and
`orientation: 'default'` for the tablet requirement, and `userInterfaceStyle: 'automatic'`
on both platforms.

Also copy `plugins/withKakaoProguard.js` verbatim from
`/Users/hyo/Github/hyodotdev/FightingHows/plugins/withKakaoProguard.js` — the Kakao SDK is
reflection-based and R8 full mode strips it; the plugin appends Kakao + Retrofit-2.9 keep
rules to the generated `android/app/proguard-rules.pro`.

### 3.5 Env vars to define (`.env.local`, mirrored into Convex with `bunx convex env set`)

```
CONVEX_DEPLOYMENT              # written by `convex dev`
EXPO_PUBLIC_CONVEX_URL         # https://<slug>.convex.cloud
EXPO_PUBLIC_CONVEX_SITE_URL    # https://<slug>.convex.site  (Apple web callback)
EXPO_PUBLIC_KAKAO_APP_KEY
EXPO_PUBLIC_NAVER_CLIENT_ID
EXPO_PUBLIC_NAVER_CLIENT_SECRET      # not secret — inlined into the JS bundle
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID     # audience of the ID token; always required
EXPO_PUBLIC_APPLE_SERVICE_ID         # Apple-on-Android web flow
EAS_PROJECT_ID
# Convex-side only:
APPLE_SERVICE_ID, AUTH_RESEND_KEY (email OTP), JWT_PRIVATE_KEY, JWKS, SITE_URL
```

---

## 4. Chart library evaluation for RN 0.86 / Reanimated 4.5.1

| Option | Version | Peers | Verdict |
|---|---|---|---|
| **`victory-native` (XL)** | `41.26.0` | `react-native-reanimated >=3.0.0`, `@shopify/react-native-skia >=1.2.3 <3.0.0`, `react-native-gesture-handler >=2.0.0` | **Recommended.** Skia-rendered → the only option that stays at 60fps with a year of daily ledger points. Deps are `d3-scale@^4`, `d3-shape@^3`, `d3-zoom@^3`, `its-fine`, `react-fast-compare` (no native code of its own). |
| `@shopify/react-native-skia` | **`2.6.2`** ← SDK 57 pin (npm latest is `2.11.1`) | `react >=19.0`, `react-native >=0.78`, `react-native-reanimated >=3.19.1` | Required by victory-native. **Pin to 2.6.2**, the Expo SDK 57 bundled version, or `expo install --fix` / `expo-doctor` will flag it. 2.6.2 satisfies victory-native's `>=1.2.3 <3.0.0`. Adds a sizeable native binary (~5-6 MB/ABI). |
| `react-native-gifted-charts` | `1.4.78` | `react-native-svg`, `expo-linear-gradient` (both already present), `react-native-linear-gradient` | Zero extra native modules — the lightweight fallback. Pure `react-native-svg`; fine for monthly bar/pie summaries, degrades on multi-hundred-point line charts. Awkward dual linear-gradient peer under Expo. |
| `react-native-wagmi-charts` | `2.10.0` | reanimated/gesture-handler | Finance line/candle only, gesture scrubbing is its strength, but narrow feature set and slower release cadence. |
| `react-native-graph` | `1.3.0` | `react-native-reanimated`, `react-native-worklets` | Skia line graph only. Beautiful, but a single chart type — not enough for a 가계부. |

**Decision:** `victory-native@41.26.0` + `@shopify/react-native-skia@2.6.2`. If the app-size cost
of Skia is unacceptable, swap to `react-native-gifted-charts@1.4.78` and drop the Skia dep —
that swap is contained to the chart components.

---

## 5. Patterns to lift from FightingHows (closest analog)

Concrete file references, all under `/Users/hyo/Github/hyodotdev/FightingHows`:

- `src/providers.tsx` — `CpkProvider` › `ErrorBoundary` › `KeyboardProvider` › `ActionSheetProvider`.
  This is the template's `RootProvider` plus `KeyboardProvider` (react-native-keyboard-controller).
- `app/_layout.tsx` — the whole Convex-Auth-on-Expo wiring:
  ```ts
  const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {unsavedChangesWarning: false});
  const secureStorage = {
    getItem: SecureStore.getItemAsync,
    setItem: SecureStore.setItemAsync,
    removeItem: SecureStore.deleteItemAsync,
  };
  <ConvexAuthProvider client={convex} storage={Platform.OS === 'web' ? undefined : secureStorage}>
  ```
  plus `setFontFamily({heading:{…}, body:{…}})` from `cpk-ui`, and a leaf `<AuthGate/>`
  component that does all `router.replace` redirects so a redirect never re-mounts the navigator.
- `src/utils/storage.ts` — `new MMKV({id: 'fighting-hows'})`, a `StorageKey` const object,
  and `getThemePreference()` / `setThemePreference()` returning `'light' | 'dark' | 'system'`.
- `src/hooks/useThemePreference.ts` — `resolveInitialThemeType()` + `useThemePreference()`.
  Includes the important note that **cpk-ui's ThemeProvider snaps `themeType` back to
  `initialThemeType` on every OS color-scheme change**, so the root layout re-resolves it via
  `Appearance.addChangeListener` + `storage.addOnValueChangedListener`.
- `src/hooks/useLayout.ts` — the tablet story: `TABLET_MIN_EDGE = 600`, `TABLET_MIN_WIDTH = 768`,
  returning `{width, height, isTablet, isLandscape, gutter, contentMaxWidth, gridColumns}`.
  Copy this instead of the template's fixed `COMPONENT_WIDTH = 500`.
- `src/styled.d.ts` — the correct kstyled + cpk-ui double augmentation.
- `src/hooks/useSession.ts` — `useConvexAuth()` + `useQuery(api.user.queries.currentUser, isAuthenticated ? {} : 'skip')`
  collapsed into a single `SessionStage` union. The `'skip'` argument is the idiom for
  conditional Convex queries.
- `src/features/auth/config.ts` — per-provider enablement gates (`isGoogleSignInConfigured()`,
  `isAppleSignInSupported()`, `isKakaoLoginEnabled()`, `isNaverLoginEnabled()`) and the
  Apple-on-Android Services-ID web flow (`APPLE_WEB_CONFIG`).
- `convex/auth.ts` — `ConvexCredentials` + `createAccount`/`retrieveAccount` keyed on the
  provider `sub` (not email), with `shouldLinkViaEmail` only when the provider asserts
  `email_verified`.
- `convex/schema/*.ts` — one file per table, re-exported from `convex/schema.ts`. Good pattern
  for BooKoo's ledger/entry/category/member tables.
- `.eslintrc.js` — the React Compiler escape hatches
  (`react-hooks/immutability`, `react-hooks/refs`, `react-hooks/set-state-in-effect` disabled
  per-file). Expect to need these once Convex query results are mirrored into local state.

---

## 6. Risks / gotchas

1. **Reanimated 4 Babel plugin.** The template's `react-native-reanimated/plugin` no longer
   exists in RN Reanimated 4.5.1. Bundling fails at the first worklet until you switch to
   `react-native-worklets/plugin`. Highest-priority fix.
2. **No `.gitignore` from npm.** §1.2. Copy it from the local clone.
3. **`jest.config.ts` references a non-existent `__mocks__/svgMock.js`.**
4. **`.husky/pre-commit` runs a non-existent `bun lint:ci` script.**
5. **`environment.d.ts` imports `./src/types`, which does not exist.**
6. **`test/testSetup.ts` does `jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))`** — verify `react-native-reanimated/mock` still resolves in 4.5.1 before trusting the test suite.
7. **`react-native-mmkv` 4.x needs `react-native-nitro-modules`.** Stay on `3.3.3`.
8. **cpk-ui pulls `react-native-web-hooks@^3.0.2` (uses removed `findDOMNode`).** Only bites on
   web. Choose: drop web (FightingHows), metro shim (template), or bun patch (Martie).
9. **`@shopify/flash-list` 2.3.2 exists on npm but SDK 57 pins 2.0.2.** Use 2.0.2 to keep
   `expo install --fix` idempotent.
10. **`@shopify/react-native-skia` npm latest 2.11.1 vs SDK 57 pin 2.6.2.** Use 2.6.2.
11. **`@convex-dev/auth@0.0.95` requires `@auth/core ^0.41.1`.** FightingHows omits it and only
    survives because it never touches an Auth.js provider. Email OTP will need it.
12. **Naver's config plugin swallows every incoming URL on its scheme before expo-router sees it.**
    Give it a dedicated scheme (`bookoonaver`), never the app's own scheme.
13. **Kakao + R8 full mode.** Without `plugins/withKakaoProguard.js`, release Android builds
    fail Kakao login silently.
14. **`ios.supportsTablet: true` + `orientation: 'default'` is a template default** but
    FightingHows turned tablet OFF. BooKoo needs it ON — so the `COMPONENT_WIDTH = 500` cap in
    `app/_layout.tsx` must go, and `useLayout()` must come in.
15. **Template `.ncurc.json` rejects `typescript` and `eslint` upgrades** — remove it before
    moving to TS `~6.0.3`.
16. **TypeScript 6.0.3** is what both reference apps run. `convex-helpers` declares
    `typescript: '^5.5 || ^6.0.0 || ^7.0.0'`, so it is compatible.
17. **`i18n-json/valid-message-syntax`** (via `custom-syntax-validator.ts`) rejects any i18n key
    containing a hyphen. Keep it, but know it constrains key naming.
18. **Infinite-data plan is not in the template at all.** Nothing in the scaffold addresses the
    legacy slowness. The pieces are: Convex `usePaginatedQuery` (built into `convex/react`),
    `@shopify/flash-list@2.0.2`, MMKV for local caches, and Convex indexes per table. Budget a
    separate research pass for the ledger query/index design.
