# 07 — Martie CLIENT ARCHITECTURE conventions (recon for BooKoo rewrite)

Source repo: `/Users/hyo/Github/hyodotdev/Martie` (read-only reference).
Everything below is verbatim-verified against files on disk on 2026-08-24.

Martie is already on the exact stack BooKoo targets: **Expo SDK 57 + expo-router 57 +
Convex + Convex Auth + cpk-ui + kstyled + MMKV + zustand + FlashList v2**. Treat it as
the canonical template. This document is the spec; later phases should not need to
re-read Martie source.

---

## 0. Exact dependency versions (installed, from `node_modules/*/package.json`)

| package | version | notes |
|---|---|---|
| `expo` | `57.0.9` (range `~57.0.9`) | SDK 57 |
| `expo-router` | `57.0.9` (range `~57.0.9`) | typed routes ON |
| `react-native` | `0.86.2` | |
| `react` / `react-dom` | `19.2.3` | React 19, `useEffectEvent` in use |
| `cpk-ui` | `0.7.0` | pinned exact, no caret |
| `kstyled` | `0.4.1` | + `babel-plugin-kstyled@0.4.1` (devDep, exact) |
| `@shopify/flash-list` | `2.0.2` | v2 — **no `estimatedItemSize` needed** |
| `convex` | `1.42.3` (range `^1.42.3`) | |
| `@convex-dev/auth` | `0.0.94` | **devDependency** in Martie |
| `react-native-mmkv` | `3.3.3` | |
| `zustand` | `5.0.14` | with `immer` `^11.1.15` |
| `@expo/match-media` | `0.4.0` | required peer for cpk-ui responsive |
| `react-responsive` | `10.0.1` | transitive, used by cpk-ui |
| `i18n-js` | `4.5.3` | |
| `react-native-error-boundary` | `3.1.0` | |
| `react-native-reanimated` | `4.5.1` | + `react-native-worklets` `0.10.1` |
| `react-native-gesture-handler` | `~2.32.0` | |
| `react-native-safe-area-context` | `~5.7.0` | |
| `react-native-keyboard-controller` | `1.21.9` | |
| `@backpackapp-io/react-native-toast` | `^0.15.1` | `<Toasts />` at root |
| `@expo/react-native-action-sheet` | `^4.1.1` | used for the language picker |
| `expo-secure-store` | `~57.0.1` | Convex Auth token storage on native |
| `expo-localization` | `~57.0.1` | |
| `date-fns` | `^4.4.0` | |
| `ts-pattern` | `^5.9.0` | |
| `immer` | `^11.1.15` | |
| typescript | `~6.0.3` | |
| package manager | `bun@1.3.13` | `bun.lock` |
| node engines | `^22.13.0 \|\| >=24.3.0` | |

Test stack: `jest ~29.7.0`, `jest-expo ~57.0.3`, `@testing-library/react-native ^13.3.3`,
`@testing-library/jest-native ^5.4.3`, `react-test-renderer 19.2.3`, `jest-fetch-mock ^4.2.0`.

---

## 1. `app/` — expo-router layout

### 1.1 Route inventory (`/Users/hyo/Github/hyodotdev/Martie/app`)

```
app/_layout.tsx                      root layout (Stack + all providers)
app/+native-intent.tsx               deep-link path rewriting (redirectSystemPath)
app/(tabs)/_layout.tsx               Tabs navigator (expo-router/js-tabs)
app/(tabs)/index.tsx                 home tab  -> _Tabs/TabIndex{Mobile,Tablet}
app/(tabs)/articles.tsx              list tab  -> _Tabs/TabArticle/TabDiscoverMobile
app/(tabs)/my.tsx                    settings tab -> _Tabs/TabMy{Mobile,Tablet}
app/_Tabs/TabIndex/TabIndexMobile.tsx     (516 lines)
app/_Tabs/TabIndex/TabIndexTablet.tsx     (522 lines)
app/_Tabs/TabArticle/TabArticleMobile.tsx (362 lines, FlashList + usePaginatedQuery)
app/_Tabs/TabArticle/TabArticleTablet.tsx (2 lines — re-export of Mobile)
app/_Tabs/TabArticle/TabDiscoverMobile.tsx
app/_Tabs/TabMy/TabMyMobile.tsx           (213 lines)
app/_Tabs/TabMy/TabMyTablet.tsx           (240 lines)
app/_Tabs/components/CustomHeader.tsx     (home header)
app/_Tabs/components/MyCustomHeader.tsx
app/_Tabs/components/DiscoverHeader.tsx
app/_Tabs/components/ArticleHeader.tsx
app/_Tabs/components/SectionHeader.tsx
app/sign-in.tsx, app/sign-in-code.tsx     (modal presentation, headerShown:false)
app/invite/[code].tsx, app/martie/invite/[code].tsx
app/<flat screens>.tsx                    ~35 flat routes (quiz.tsx, chat.tsx, league.tsx, ...)
```

**Convention:** flat file routes at `app/*.tsx`, no nested group folders except `(tabs)`.
Dynamic segments: `app/invite/[code].tsx`, `app/admin-quiz-submissions/[submissionId].tsx`.

**Convention (documented in `app/(tabs)/index.tsx` header comment, in Korean):**
> "여기 안에 컴포넌트들을 다 넣으면 탭 수가 늘어나기 때문에 `_Tabs` 폴더 안에 화면 안에
> 필요한 컴포넌트들을 넣어야 합니다."
> — i.e. **anything placed directly under `app/(tabs)/` becomes a tab.** All the
> per-tab sub-components must live under `app/_Tabs/` (underscore prefix = not a route).

### 1.2 `app/_layout.tsx` — full structure

Module-scope side effects, executed at import time **before** any component renders:

```ts
SplashScreen.preventAutoHideAsync();
installGrowtokiGlobalErrorHandler();
reportPendingCrashSentinel();

const appModuleStartedAt = Date.now();

configureMobileAdsRequest()
  .then(() => { logEvent('admob_request_configuration_set'); })
  .catch((error) => { logError(error, 'admob_request_configuration_set_error'); });

setFontFamily({
  heading: {normal: 'NanumSquareRoundOTFR', bold: 'NanumSquareRoundOTFB', thin: 'NanumSquareRoundOTFF'},
  body:    {normal: 'NanumSquareRoundOTFR', bold: 'NanumSquareRoundOTFB', thin: 'NanumSquareRoundOTFF'},
});

const secureStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});
```

`setFontFamily` is a **cpk-ui** export that re-points Typography's font stack.

**Provider order — this is the thing to copy exactly** (`RootLayout`, the default export):

```tsx
function RootLayout(): JSX.Element | null {
  const isDarkMode = storage.getBoolean(Storage.ThemeType);

  return (
    <GestureHandlerRootView style={css`flex: 1; align-self: stretch;`}>
      <RootProvider initialThemeType={isDarkMode ? 'dark' : 'light'}>
        <GrowtokiRootProvider>
          <ConvexAuthProvider
            client={convex}
            storage={
              Platform.OS === 'android' || Platform.OS === 'ios'
                ? secureStorage
                : undefined
            }
          >
            <App />
          </ConvexAuthProvider>
        </GrowtokiRootProvider>
      </RootProvider>
    </GestureHandlerRootView>
  );
}
export default RootLayout;
```

Full nesting once `RootProvider` (`src/providers.tsx`) is expanded:

```
GestureHandlerRootView
└─ CpkProvider  (themeConfig={{initialThemeType, customTheme: theme}})
   └─ ThemeProvider (cpk internal) → SafeAreaProvider → AppProvider (loads cpk fonts,
      provides snackbar + alertDialog + assetLoaded), kstyled ThemeProvider inside
      └─ ErrorBoundary (FallbackComponent, onError=handleErrorConsole)
         └─ KeyboardProvider              (react-native-keyboard-controller)
            └─ ActionSheetProvider        (@expo/react-native-action-sheet)
               └─ GrowtokiRootProvider    [ANALYTICS — DROP for BooKoo]
                  └─ ConvexAuthProvider   (client + expo-secure-store on native)
                     └─ App
```

> Note: `SafeAreaProvider` comes from **inside** `CpkProvider` (cpk-ui
> `providers/index.js` → `CpkWithThemeProvider` renders `ThemeProvider > SafeAreaProvider >
> AppProvider`). Do not add a second one.

### 1.3 `App` — fonts, splash, gating

```tsx
const [appFontsLoaded] = useFonts({
  NanumSquareRoundOTFB: FONT_NANUM_B,
  NanumSquareRoundOTFR: FONT_NANUM_R,
  NanumSquareRoundOTFF: FONT_NANUM_L,
});
const {assetLoaded, theme} = useCPK();     // assetLoaded = cpk's own font load
const {isChecking, checkUpdate} = useEASUpdate();

useEffect(() => {
  if (appFontsLoaded && assetLoaded && !isChecking) {
    if (!didTrackAppStartTraceRef.current) {
      didTrackAppStartTraceRef.current = true;
      logEvent(GROWTOKI_EVENTS.PERFORMANCE_TRACE, {
        trace_name: 'app_start',
        duration_ms: Date.now() - appModuleStartedAt,
        source: 'root_layout_ready',
      });
    }
    SplashScreen.hideAsync();
  }
}, [appFontsLoaded, assetLoaded, isChecking]);

if (!appFontsLoaded || !assetLoaded || isChecking) {
  return <CustomLoadingIndicator />;
}
```

Three gates before splash hides: **app fonts**, **cpk-ui fonts (`assetLoaded`)**, and
**EAS update check finished**.

Status bar sync:

```tsx
useEffect(() => {
  Platform.OS === 'android' && StatusBar.setBackgroundColor(theme.bg.basic);
  StatusBar.setBarStyle(isDarkMode ? 'light-content' : 'dark-content');
}, [isDarkMode, theme]);
```

### 1.4 Root `<Stack>` screenOptions (theme-driven header)

```tsx
<Stack
  screenOptions={{
    headerStyle: {backgroundColor: theme.bg.basic},
    contentStyle: {backgroundColor: theme.bg.basic},
    headerShadowVisible: false,
    headerTintColor: theme.text.label,
    headerTitleStyle: {fontWeight: 'bold', color: theme.text.basic},
    headerLeft: ({canGoBack}) =>
      canGoBack && (
        <RectButton
          hitSlop={{top: 8, left: 8, right: 8, bottom: 8}}
          onPress={() => (canGoBack ? back() : replace('/'))}
          style={css`padding: 8px; border-radius: 48px;`}
        >
          <Icon name="CaretLeftBold" size={24} />
        </RectButton>
      ),
  }}
>
  <Stack.Screen name="(tabs)" options={{headerShown: false}} />
  <Stack.Screen name="sign-in"      options={{presentation: 'modal', headerShown: false}} />
  <Stack.Screen name="sign-in-code" options={{presentation: 'modal', headerShown: false}} />
</Stack>
```

Auth screens are **modal presentations declared at layout level**, not in the screen file.

### 1.5 Global overlays rendered as siblings of `<Stack>` (not routes)

```tsx
<Container>
  <Content><Stack .../></Content>
  {!showBannerAd ? <View style={css`height: ${bottom + 'px'};`} /> : <BannerAdmob />}
  <ForceUpdateModal onVisibilityChange={setForceUpdateModalVisible} />
  <SignInRequireModal />
  <DisplayNameModal />
  <FirstQuizModal />
  <ErrorBoundary FallbackComponent={EmptyFallback} onError={handleGrowtokiBoundaryError}>
    <StreakRecoveryModal onVisibilityChange={setStreakRecoveryModalVisible} />
  </ErrorBoundary>
  <Toasts />
</Container>
```

with

```tsx
const Container = styled.View`flex: 1; background-color: ${({theme}) => theme.bg.basic};`;
const Content   = styled.View`flex: 1; background-color: ${({theme}) => theme.bg.basic};
                              align-self: center; width: 100%;`;
```

Pattern to copy for BooKoo: **app-wide modals are zustand-visible-flag components mounted
once at root**, never routes. A `hasBlockingOverlay` boolean is derived from every modal's
store so the banner-ad / bottom chrome can be suppressed:

```tsx
const hasBlockingOverlay =
  isFirstQuizModalVisible || isSignInRequireModalVisible ||
  isDisplayNameModalVisible || isForceUpdateModalVisible ||
  isStreakRecoveryModalVisible;
```

### 1.6 Deep links

- `app.config.ts`: `scheme: 'martie'`, `DEEP_LINK_HOST = 'hyo.dev'`,
  iOS `associatedDomains: ['applinks:hyo.dev']`,
  Android `intentFilters` with `autoVerify: true` for path prefixes
  `['/martie', '/en/martie', '/ko/martie', '/ja/martie']`.
- `app/+native-intent.tsx` exports `redirectSystemPath({path})` which rewrites incoming
  web paths onto app routes:

```ts
const MARTIE_WEB_PATH_PATTERN = /^\/(?:en\/|ko\/|ja\/)?martie(?:\/|$)/;
const MARTIE_INVITE_PATH_PATTERN = /^\/(?:en\/|ko\/|ja\/)?martie\/invite\/([^/?#]+)/;

export function redirectSystemPath({path}: RedirectSystemPathParams): string {
  try {
    const pathname = normalizePath(path);
    const inviteMatch = pathname.match(MARTIE_INVITE_PATH_PATTERN);
    if (inviteMatch?.[1]) return `/invite/${inviteMatch[1]}`;
    if (MARTIE_WEB_PATH_PATTERN.test(pathname)) return '/(tabs)';
  } catch {
    if (MARTIE_WEB_PATH_PATTERN.test(path)) return '/(tabs)';
  }
  return path;
}
```

- Runtime attribution in `_layout.tsx`: `Linking.getInitialURL()` at boot + a live
  `Linking.addEventListener('url', ...)` subscription; both feed
  `getSourceFromUrl()` which does `Linking.parse(url)` and picks
  `queryParams.source ?? queryParams.utm_source`. First-touch wins
  (`setAcquisitionSourceOnce`). **Analytics-only — droppable for BooKoo**, but the
  `Linking` wiring pattern is reusable for invite links.

### 1.7 EAS Updates

`app.config.ts`:

```ts
updates: {
  fallbackToCacheTimeout: 0,
  requestHeaders: {'expo-channel-name': 'production'},
  url: 'https://u.expo.dev/89e8816c-1b59-4336-b3ea-110469262de7',
},
runtimeVersion: {policy: 'appVersion'},
```

`src/hooks/useEASUpdate.ts` — full contract:

```ts
export const useEASUpdate = () => {
  const {isUpdatePending, currentlyRunning} = useUpdates();
  const [isChecking, setIsChecking] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);

  useEffect(() => {                       // auto-reload when an update is staged
    if (isUpdatePending) { logEvent('update_pending'); await reloadAsync(); }
  }, [isUpdatePending]);

  const checkUpdate = useCallback(async () => {
    if (__DEV__) return false;            // skipped in dev
    setIsChecking(true);
    let update;
    try { update = await checkForUpdateAsync(); }
    catch (e) { setHasUpdate(false); setIsChecking(false); logUpdateCheckFailure(e); return false; }
    try {
      if (update.isAvailable) { await fetchUpdateAsync(); setHasUpdate(true); await reloadAsync(); }
      return update.isAvailable;
    } catch (e) { setHasUpdate(false); logError(e, 'applyUpdate'); return false; }
    finally { setIsChecking(false); }
  }, []);

  return {isChecking, hasUpdate, checkUpdate, currentlyRunning};
};
```

Failure reasons are bucketed by string match: `network_request_failed`,
`failed_to_check_for_update`, `native_update_check_rejected`, `unknown`.

Root `App` calls `await checkUpdate()` inside its `initializeApp()` effect and blocks the
splash on `isChecking`.

---

## 2. Tablet / responsive pattern — **the thing BooKoo must copy**

### 2.1 Where the breakpoint comes from

**Not** `useWindowDimensions`. It is `cpk-ui`'s `useCPK().media`, which is powered by
`react-responsive`'s `useMediaQuery` with the `@expo/match-media` polyfill.

`/Users/hyo/Github/hyodotdev/Martie/node_modules/cpk-ui/providers/ThemeProvider.js`:

```js
import '@expo/match-media';                       // side-effect polyfill — REQUIRED
import { useMediaQuery } from 'react-responsive';

export function ThemeProvider({ children, initialThemeType, customTheme = {},
                                responsiveDesignMode = 'mobile-first' }) {
    const isPortrait = useMediaQuery({ orientation: 'portrait' });
    const isMobile = useMediaQuery(responsiveDesignMode === 'mobile-first'
        ? { minWidth: 0 }
        : { minWidth: 0, maxWidth: 767 });
    const isTablet = useMediaQuery(responsiveDesignMode === 'mobile-first'
        ? { minWidth: 767 }
        : { minWidth: 768, maxWidth: 992 });
    const isDesktop = useMediaQuery(responsiveDesignMode === 'mobile-first'
        ? { minWidth: 992 } : { minWidth: 0 });
    ...
    const media = { isPortrait, isMobile, isTablet, isDesktop };
    const theme = { ...baseTheme, ...media };     // media flags are ALSO merged into theme
    return <CpkProvider value={{media, themeType, changeThemeType, theme}}>
             <KStyledThemeProvider theme={theme}>{children}</KStyledThemeProvider>
           </CpkProvider>;
}
```

Type (`providers/ThemeProvider.d.ts`):

```ts
export type ThemeContext = {
  themeType: ColorSchemeName;
  media: {isPortrait: boolean; isMobile: boolean; isTablet: boolean; isDesktop: boolean};
  theme: DefaultTheme & CpkTheme;
  changeThemeType: (themeType?: ColorSchemeName) => void;
};
```

**Gotchas (mobile-first is the default and Martie never overrides it):**
- `isMobile` is `minWidth: 0` → **always `true`**. Never branch on `isMobile`.
- `isTablet` is `minWidth: 767` → true for tablets *and* desktop. The only correct
  branch is `isTablet ? <Tablet/> : <Mobile/>`.
- The media flags are also spread onto the kstyled theme, so
  `${({theme}) => theme.isTablet ? ... : ...}` works inside `styled` templates.
- `@expo/match-media` must be a direct dependency of the app (`^0.4.0` in Martie's
  `package.json`) even though cpk-ui imports it — it patches `window.matchMedia` for RN.

### 2.2 The screen split

Route file stays thin; it picks Mobile vs Tablet and owns the header:

`app/(tabs)/index.tsx` (entire file):

```tsx
export default function Index(): JSX.Element {
  const {media: {isTablet}} = useCPK();

  useEffect(() => {
    clearCrashSentinel('quiz_final_to_home');
    clearCrashSentinel('daily_result_to_home');
  }, []);

  return (
    <Container>
      <Stack.Screen options={{header: () => <CustomHeader />}} />
      {isTablet ? <TabIndexTablet /> : <TabIndexMobile />}
    </Container>
  );
}

const Container = styled.View`
  background-color: ${({theme}) => theme.bg.basic};
  flex: 1;
  align-self: stretch;
`;
```

`app/(tabs)/my.tsx` — same shape but **all business logic and the data model live in the
route file**, and the Mobile/Tablet components are pure presentational and take props:

```tsx
export type SubSection = {title: string; onPress: () => void};
export type Section =
  | {title: string; description?: string; onPress?: () => void; label?: string;
     labelVariant?: 'default' | 'code'}
  | {... ; isToggle: boolean; isOn: boolean; ...}
  | {... ; isExpandable: boolean; subSections: SubSection[]; ...};

const sections: Section[] = [ ... ];         // built in the route

return (
  <Container>
    <Stack.Screen options={{header: () => <CustomHeader />}} />
    {isTablet ? <TabMyTablet sections={sections} /> : <TabMyMobile sections={sections} />}
  </Container>
);
```

### 2.3 What actually differs between Mobile and Tablet

`TabMyMobile` returns the list bare:

```tsx
return (
  <FlashList data={sections} ListHeaderComponent={SectionHeader}
             renderItem={renderSections} extraData={expandedIndex} />
);
```

`TabMyTablet` wraps it in a centered max-width column — **this is the entire tablet
strategy**:

```tsx
return (
  <Wrapper>
    <Content>
      <FlashList data={sections} ListHeaderComponent={SectionHeader}
                 renderItem={renderSections} extraData={expandedIndex} />
    </Content>
  </Wrapper>
);

const Wrapper = styled.View`
  flex: 1;
  align-items: center;
`;

const Content = styled.View`
  max-width: 700px;
  width: 100%;
  flex: 1;
`;
```

Plus small scale bumps: paddings `16px 24px` → `20px 24px`, `Typography.Body1` gets
`font-size: 18px`, `Icon size={24}` → `28`, `SwitchToggle` scale `0.9` → `1.0`.

### 2.4 Three sanctioned degrees of responsive effort

1. **Full split** — two files with genuinely different layouts:
   `TabIndexMobile.tsx` / `TabIndexTablet.tsx` (516 / 522 lines, near-duplicated).
2. **Wrapper-only split** — same list, tablet adds centered `max-width` container:
   `TabMyMobile` / `TabMyTablet`.
3. **Alias** — tablet is literally the mobile file. `app/_Tabs/TabArticle/TabArticleTablet.tsx`
   is 2 lines:
   ```tsx
   import TabArticleMobile from './TabArticleMobile';
   export default TabArticleMobile;
   ```
   Keeps the import site uniform while admitting no tablet design exists yet.

**Recommendation for BooKoo:** default to (2)/(3). Option (1) produced ~1000 duplicated
lines in Martie that drift — an explicit anti-pattern to avoid.

### 2.5 The same split inside `src/uis/`

`src/uis/QuizView/index.tsx` is a *container* that owns all state/animation and delegates
rendering:

```
src/uis/QuizView/index.tsx           logic + animations, picks Mobile|Tablet
src/uis/QuizView/QuizViewMobile.tsx  presentational
src/uis/QuizView/QuizViewTablet.tsx  presentational
src/uis/QuizView/types.ts            QuizViewProps (container) + QuizViewUIProps (leaf)
src/uis/QuizView/Result/index.tsx    same pattern one level down
src/uis/QuizView/Result/{ResultMobile,ResultTablet,types}.tsx
```

```tsx
const {media: {isTablet}} = useCPK();
...
const quizViewProps = {quiz, onPressAnswer: handleAnswerPress, isAnswerPending,
                       bubbleAnimatedStyle, imageAnimatedStyle, buttonAnimatedStyle};
return isTablet ? <QuizViewTablet {...quizViewProps} /> : <QuizViewMobile {...quizViewProps} />;
```

Two prop types per split component: `XProps` (container's public API) and `XUIProps`
(what the leaf receives, incl. precomputed animated styles). Copy this.

### 2.6 `app/(tabs)/_layout.tsx` — the Tabs navigator

```tsx
import {Tabs} from 'expo-router/js-tabs';        // NOT 'expo-router'
```

```tsx
const {theme} = useCPK();
const {isAuthenticated, isLoading} = useConvexAuth();
const user = useQuery(api.user.queries.currentUser, {});

if (isLoading) return <CustomLoadingIndicator />;

<Tabs
  initialRouteName="index"
  screenOptions={{
    tabBarActiveTintColor: theme.role.primary,
    headerStyle: {backgroundColor: theme.bg.basic},
    headerTitleStyle: {color: theme.text.basic},
    tabBarStyle: [css`
      background-color: ${theme.bg.basic};
      height: 60px;
      padding: 0;
    `],
  }}
>
  <Tabs.Screen
    name="index"
    options={{
      tabBarShowLabel: false,
      tabBarLabelPosition: 'beside-icon',
      tabBarIcon: ({focused}) => (
        <View style={css`padding-bottom: 8px;`}>
          <TabIndexSvgIcon width={32} height={32}
            strokeColor={focused ? theme.role.primary : theme.text.placeholder}
            fillColor={focused ? theme.role.primary : theme.text.placeholder} />
        </View>
      ),
    }}
    listeners={{tabPress: () => logEvent(LOG_EVENTS.TAB_CHANGED, {tab: 'home'})}}
  />
  ...
  <Tabs.Screen
    name="my"
    options={{...}}
    listeners={{
      tabPress: (e) => {
        if (!isAuthenticated) {
          e.preventDefault();
          logEvent(LOG_EVENTS.LOGIN_PROMPT_SHOWN, {source: 'my_tab'});
          setVisible(true);          // opens the global SignInRequireModal
          return;
        }
        logEvent(LOG_EVENTS.TAB_CHANGED, {tab: 'my'});
      },
    }}
  />
</Tabs>
```

**Auth-gating a tab = `listeners.tabPress` + `e.preventDefault()` + open the global
sign-in modal.** The gated screen (`my.tsx`) *additionally* does
`if (!isAuthenticated) return <Redirect href="/(tabs)" />` as a belt-and-braces guard.

Tab icons are hand-written `react-native-svg` components in `src/uis/Tab*SvgIcon.tsx`
taking `{width, height, strokeColor, fillColor}` — not an icon font.

### 2.7 Custom headers

Per-screen headers are supplied via `<Stack.Screen options={{header: () => <CustomHeader />}} />`
inside the screen body. The header component itself consumes `useSafeAreaInsets().top` and
paints its own background:

```tsx
<View style={css`
  padding: ${top + 'px'} 16px 0;
  background-color: ${theme.bg.basic};
  height: ${68 + top + 'px'};
  flex-direction: row; align-items: center; justify-content: space-between;
`}>
```

Note the kstyled idiom for numeric interpolation: `${top + 'px'}` (string concatenation,
never a bare number).

---

## 3. Theme: `src/providers.tsx` + `src/theme.ts`

### 3.1 `src/providers.tsx` (entire file)

```tsx
import {ActionSheetProvider} from '@expo/react-native-action-sheet';
import {CpkProvider} from 'cpk-ui';
import {KeyboardProvider} from 'react-native-keyboard-controller';

import {theme} from './theme';
import {handleErrorConsole} from './utils/error';
import FallbackComponent from './uis/FallbackComponent';
import ErrorBoundary from 'react-native-error-boundary';

type AppThemeType = 'light' | 'dark';

interface Props {
  initialThemeType?: AppThemeType;
  children?: JSX.Element;
}

export default function RootProvider({initialThemeType, children}: Props): JSX.Element {
  return (
    <CpkProvider themeConfig={{initialThemeType, customTheme: theme}}>
      <ErrorBoundary FallbackComponent={FallbackComponent} onError={handleErrorConsole}>
        <KeyboardProvider>
          <ActionSheetProvider>{children}</ActionSheetProvider>
        </KeyboardProvider>
      </ErrorBoundary>
    </CpkProvider>
  );
}
```

`RootProvider` is reused verbatim by the test harness (`test/testUtils.tsx`), which is
why it takes `initialThemeType` as a prop rather than reading storage itself.

### 3.2 `src/theme.ts` — `CustomAppTheme extends CpkThemeParams`

```ts
import {CpkThemeParams} from 'cpk-ui/utils/theme';

export type CustomAppTheme = CpkThemeParams & {
  role: {icon: string; selectedBorder: string; unselectedBg: string;
         selectedBg: string; stripe: string};
  bg:   {bubble: string; progress: string; dialog: string};
  text: {success: string; danger: string};
};

export const light: CustomAppTheme = {...};
export const dark:  CustomAppTheme = {...};

export const theme = {light, dark};     // <- shape consumed by CpkProvider customTheme
```

Concrete Martie values (copy the *shape*, not the colors):

```
light.role  = {primary:'#FF5B50', icon:'#37140B', border:'#E8E8E8',
               selectedBorder:'#FFB1A3', selectedBg:'#F8F6E5',
               unselectedBg:'#F3F2E5', stripe:'#A3E635'}
light.bg    = {basic:'#FFFDF6', paper:'#F3F2E5', bubble:'#FFFFFF',
               progress:'#FF9F79', dialog:'#FFFFFF'}
light.text  = {basic:'#37140B', contrast:'#FFFFFF', disabled:'#8F8F8F',
               placeholder:'#BEBEBE', success:'#1FB763', danger:'#E53A3C'}
light.button= {primary:{bg:'#FF5B50',text:'#FFFFFF'}, secondary:{bg:'#F3F2E5',text:'#37140B'},
               disabled:{bg:'#E8E8E8',text:'#7C7C7C'}, success:{bg:'#1FB763',text:'#FFFFFF'},
               danger:{bg:'#E53A3C',text:'#FFFFFF'}, light:{bg:'#F3F2E5',text:'#37140B'}}

dark.role   = {primary:'#FF5B50', icon:'#F4F1E8', border:'#45454A',
               selectedBorder:'#FFB1A3', selectedBg:'#333236', unselectedBg:'#3A3A3D',
               stripe:'#7FB127', success:'#35E879', danger:'#FF5252'}
dark.bg     = {basic:'#1F2023', paper:'#303136', bubble:'#2B2C31',
               progress:'#FF9F79', dialog:'#25262A'}
dark.text   = {basic:'#FFFDF6', contrast:'#2D2D2D', disabled:'#7F828C',
               placeholder:'#9A9CA6', success:'#35E879', danger:'#FF5252'}
dark.button = {primary:{bg:'#FF5B50',text:'#FFFFFF'}, secondary:{bg:'#3A3A3D',text:'#FFFFFF'},
               disabled:{bg:'#37383D',text:'#8A8D96'}, success:{bg:'#1FB763',text:'#FFFFFF'},
               danger:{bg:'#E53A3C',text:'#FFFFFF'}, light:{bg:'#404040',text:'#FFFFFF'}}
```

Merge semantics (cpk-ui `genTheme`): the custom theme is **deep-merged per top-level group
and per button variant** over cpk's built-in `light`/`dark`. Anything you omit falls back
to cpk defaults, so you get `role.link`, `role.underlay`, `text.label`,
`text.validation`, `bg.disabled`, `button.{warning,info}` for free.

cpk-ui base token surface (`cpk-ui/utils/colors.d.ts`) — the full contract you can rely on:

```ts
bg:   {basic, paper, disabled}
role: {primary, secondary, success, warning, danger, info, accent, link,
       border, underlay, underlayContrast}
text: {basic, label, placeholder, disabled, validation, contrast}
button: {primary, secondary, success, danger, warning, info, light, disabled}
        each {bg, text}
```

cpk defaults, for reference: light `bg.basic '#FFFFFF'`, `bg.paper '#EDEDED'`,
`text.label '#4D4D4D'`; dark `bg.basic '#242424'`, `bg.paper '#1E1D1D'`,
`role.border '#363636'`.

### 3.3 Type augmentation — `src/styled.d.ts` (entire file)

```ts
import 'kstyled';
import type {CustomAppTheme} from './theme';
import {CpkTheme} from 'cpk-ui/utils/theme';

type AllTheme = CustomAppTheme & CpkTheme;

declare module 'kstyled' {
  export interface DefaultTheme extends AllTheme {}
}

declare module 'cpk-ui' {
  export interface CpkTheme extends AllTheme {}
}
```

`tsconfig.json` lists it explicitly under `"files": ["environment.d.ts", "src/styled.d.ts"]`
so the augmentation is always loaded.

### 3.4 Persistence + toggle

Storage key: `Storage.ThemeType` = `'ThemeType'`, an MMKV **boolean** meaning `isDarkMode`.

Read at boot (`app/_layout.tsx`, non-reactive):

```tsx
const isDarkMode = storage.getBoolean(Storage.ThemeType);
<RootProvider initialThemeType={isDarkMode ? 'dark' : 'light'}>
```

Toggle (`app/(tabs)/my.tsx`):

```tsx
const {media: {isTablet}, changeThemeType} = useCPK();
const [isDarkMode, setIsDarkMode] = useMMKVBoolean(Storage.ThemeType);   // reactive

const toggleTheme = useCallback(() => {
  const newThemeType = isDarkMode ? 'light' : 'dark';
  setIsDarkMode(!isDarkMode);                       // persist first
  setTimeout(() => {
    changeThemeType(newThemeType);                  // then swap the context
    SystemUI.setBackgroundColorAsync(
      newThemeType === 'dark' ? dark.bg.basic! : light.bg.basic!,
    );
  }, 100);
}, [isDarkMode, setIsDarkMode, changeThemeType]);
```

The 100 ms `setTimeout` lets the switch animation settle before the whole tree re-themes.
`expo-system-ui`'s `setBackgroundColorAsync` paints the OS window background so there is
no white flash behind the app.

**BUGS / GOTCHAS to fix in BooKoo:**
1. `storage.getBoolean` returns `undefined` when the key was never set, so
   `isDarkMode ? 'dark' : 'light'` always yields `'light'` on first launch. Because
   cpk's `ThemeProvider` does `useState(initialThemeType ?? colorScheme)` and then
   `useEffect(() => { if (initialThemeType) setThemeType(initialThemeType); else setThemeType(colorScheme); })`,
   **passing a defined `initialThemeType` permanently disables OS dark-mode following.**
   BooKoo should store a tri-state (`'light' | 'dark' | 'system'`) and pass
   `initialThemeType={stored === 'system' ? undefined : stored}`.
   (`app.config.ts` already sets `userInterfaceStyle: 'automatic'` and
   `android.userInterfaceStyle: 'automatic'`, so the OS scheme is available.)
2. `RootLayout` and `App` read `storage.getBoolean(Storage.ThemeType)` **non-reactively**;
   only `my.tsx` uses the reactive `useMMKVBoolean`. Consequently the root `StatusBar`
   bar-style does not update until a root re-render. Use `useMMKVBoolean`/`useMMKVString`
   at the root instead.
3. cpk-ui's `changeThemeType(undefined)` toggles; `changeThemeType('dark'|'light')` sets.

---

## 4. `src/utils/storage.ts` — MMKV

Entire file:

```ts
import {MMKV} from 'react-native-mmkv';

export const storage = new MMKV();

export const Storage = {
  DidFinishOnboarding: 'DidFinishOnboarding',
  DidFinishTutorial: 'DidFinishTutorial',
  ThemeType: 'ThemeType',
  BulbCount: 'BulbCount',
  LastQuizCursor: 'LastQuizCursor',
  LastCheckInDate: 'LastCheckInDate',
  Volume: 'Volume',
  IsRewarded: 'IsRewarded',
  Locale: 'Locale',
  DidFinishFirstDaily: 'DidFinishFirstDaily',
  PendingReferralCode: 'PendingReferralCode',
  GuestDailyResult: 'GuestDailyResult',
  LastDailyCompletionSummary: 'LastDailyCompletionSummary',
  AcquisitionSource: 'AcquisitionSource',
  NotiPermissionAskedAt: 'NotiPermissionAskedAt',
  NotiPermissionAskCount: 'NotiPermissionAskCount',
  NotiPermissionGranted: 'NotiPermissionGranted',
  FirstLaunchAt: 'FirstLaunchAt',
  LastSeenStreak: 'LastSeenStreak',
  // Persisted MMKV key kept as 'StreakRecoveryUsedAt' for backward compatibility
  StreakRecoveryLastSeenAt: 'StreakRecoveryUsedAt',
  DidFireSignupCompleted: 'DidFireSignupCompleted',
  PendingGrowtokiSignupCompletion: 'PendingGrowtokiSignupCompletion',
  AppReviewLastAskedAt: 'AppReviewLastAskedAt',
  AppReviewAskCount: 'AppReviewAskCount',
  GrowtokiAnonymousId: 'GrowtokiAnonymousId',
  GrowtokiDiagnosticSpool: 'GrowtokiDiagnosticSpool',
  GrowtokiCrashSentinel: 'GrowtokiCrashSentinel',
} as const;
```

Conventions:
- A **single default `MMKV()` instance** exported as `storage`; no per-domain instances.
- All keys live in one `as const` object named `Storage`; **key name === value**, PascalCase.
- The struct-name/key-value may diverge for backwards compat, and when it does there is a
  comment saying so (see `StreakRecoveryLastSeenAt`).
- Imperative reads/writes: `storage.getString/getNumber/getBoolean/set/delete`.
- Reactive reads inside components: `useMMKVString`, `useMMKVNumber`, `useMMKVBoolean`
  from `react-native-mmkv`, e.g.
  `const [lastCheckIn, setLastCheckIn] = useMMKVString(Storage.LastCheckInDate);`
- JSON blobs (e.g. `GuestDailyResult`) are stored as strings and parsed by a dedicated
  helper module in `src/utils/`.

---

## 5. `src/stores/*` — zustand conventions

Files: `answersStore.ts`, `categoriesStore.ts`, `displayNameModalState.tsx`,
`firstQuizModalStore.ts`, `iapStore.ts`, `quizStore.ts`, `signInRequireModalStore.ts`,
`userStore.ts`.

**Canonical form** — `create<T>()(immer(set => ...))`, split `State` / `Action` interfaces,
`initialState` const, named export `useXStore`:

```ts
import {create} from 'zustand';
import {immer} from 'zustand/middleware/immer';

interface SignInRequireModalState {visible: boolean}
interface SignInRequireModalAction {setVisible: (isVisible: boolean) => void}

export type SignInModalStoreType = SignInRequireModalState & SignInRequireModalAction;

const initialState: SignInRequireModalState = {visible: false};

export const useSignInRequireModalStore = create<SignInModalStoreType>()(
  immer((set) => ({
    ...initialState,
    setVisible: (isVisible) => set((state) => { state.visible = isVisible; }),
  })),
);
```

Variants seen:
- **No middleware** (simplest): `answersStore.ts` uses plain `create<AnswerStore>((set) => ...)`
  with functional updates.
- **`devtools(immer(...))` + action labels**: `categoriesStore.ts`
  ```ts
  export const useCategoriesStore = create<State & Actions>()(
    devtools(immer((set) => ({
      selectedCategories: [],
      toggleCategory: (category) => set((state) => {...}, false, {type: 'categories/toggle', category}),
      clearCategories:  () => set((state) => {state.selectedCategories = [];}, true, {type: 'categories/clear'}),
    }))),
  );
  ```
- **MMKV-backed store** (`quizStore.ts`) — hydrate from MMKV at module scope, write through
  inside the setter. No `persist` middleware:
  ```ts
  const initialCursor = storage.getString(Storage.LastQuizCursor) || undefined;

  const useQuizStore = create<QuizState>()(
    immer((set) => ({
      lastQuizKeyCursor: initialCursor,
      setLastQuizKeyCursor: (cursor) => set((state) => {
        state.lastQuizKeyCursor = cursor;
        if (cursor) storage.set(Storage.LastQuizCursor, cursor);
        else storage.delete(Storage.LastQuizCursor);
      }),
    })),
  );
  export default useQuizStore;      // NOTE: this one is a default export (inconsistent)
  ```
- **Async side-effect store** (`userStore.ts`): an async action (`checkPremium`) does IO
  first, then a single `set` that early-`return`s when nothing changed:
  ```ts
  set((state) => {
    if (state.isPremium === nextIsPremium && state.premiumPlan === nextPremiumPlan
        && !shouldUpdateBadge) return;              // no-op guard = no re-render
    state.isPremium = nextIsPremium; ...
  });
  ```

**Selector usage at call sites** — always subscribe narrowly:

```tsx
const isFirstQuizModalVisible = useFirstQuizModalStore((state) => state.visible);
const setSignInRequireModalVisible = useSignInRequireModalStore((state) => state.setVisible);
```
(Whole-store destructuring `const {visible, setVisible} = useSignInRequireModalStore();`
also appears; prefer the selector form in BooKoo for list-heavy screens.)

**Modal stores are the dominant pattern:** every global modal (`SignInRequireModal`,
`DisplayNameModal`, `FirstQuizModal`) has a 1-field `{visible}` store + `setVisible`.
`firstQuizModalStore` adds a `wasShown: boolean` "once per session" latch set inside
`setVisible(true)`.

Naming inconsistencies to *not* copy: `iapStore.ts` and `userStore.ts` both export
`useUserStore`; `displayNameModalState.tsx` is `.tsx` with no JSX.

---

## 6. `src/hooks/*`

| hook | purpose / pattern |
|---|---|
| `useAppState.ts` | `useAppState(handler)` — thin `AppState.addEventListener('change')` wrapper with cleanup. |
| `useAsync.ts` | `{execute, loading}`; re-entrancy guarded by `isExecutingRef`; keeps latest fn in `asyncFunctionRef` so `execute` is stable (`useCallback([], …)`). |
| `useEASUpdate.ts` | see §1.7. |
| `useLocale.ts` | see §8. |
| `useBulbManager.ts` | **local-vs-server dual-source pattern** — worth copying for BooKoo's offline/guest ledger. `useMMKVNumber(Storage.BulbCount)` for guests, `useQuery(api.user.queries.getBulbCount)` for signed-in; `const bulbCount = isLoggedIn ? (serverBulbCount ?? 0) : (localBulbCount ?? 0)`; `isQueryLoading = currentUser === undefined \|\| (isLoggedIn && serverBulbCount === undefined)`. Mutations: `updateBulbCount({count, operation: 'set'\|'add'\|'subtract'})`, `syncBulbCount`, `initializeBulbCount`. |
| `useQuizzes.ts` | thin wrapper over `usePaginatedQuery` returning a domain-shaped object — see §9.2. |
| `useFirstQuizModalTrigger.ts` | "show a modal once, under N guards" pattern: `useIsFocused()` (from `expo-router/react-navigation`) + `usePathname()` + MMKV latch + zustand `wasShown` + a Convex query with `'skip'` + `setTimeout(600ms)` with cleanup. |
| `useNotificationPermissionFlow.ts`, `useModelStatus.ts`, `useStandardQuizStart.ts`, `useTypewriter.ts` | domain-specific. |

Two idioms worth lifting:
- **Conditional Convex query with `'skip'`:**
  ```ts
  const dailyChallenge = useQuery(
    api.dailyChallenge.queries.getToday,
    isAuthLoading || !canShowOnPath ? 'skip' : {language: quizLanguage},
  );
  ```
- **`useEffectEvent` (React 19)** for effect bodies that must read the latest props/state
  without joining the dep array — used in `_layout.tsx`
  (`attemptPendingSignupCompletionDelivery`).

---

## 7. `src/uis/*` — reusable component conventions

Directory layout: flat files for simple components (`ButtonMartie.tsx`, `ListEmptyItem.tsx`,
`ProgressBar.tsx`), folders when a component has variants/subparts
(`Bubble/`, `Discover/`, `QuizView/`, `ShareCard/`, `DailyChallenge/`, `League/`,
`Common/SkeletonBox.tsx`, `TabMy/accessibility.ts`).

### 7.1 The house style

```tsx
/**
 * @name QuizResultItem
 *
 * See the style guide: https://github.com/hyochan/style-guide/blob/main/docs/REACT.md
 */
import {styled, css} from 'kstyled';
import {StyleProp, ViewStyle} from 'react-native';
import {Button, Typography, useCPK} from 'cpk-ui';
import {t} from '../STRINGS';

type Props = {
  item: QuizResultWithDetails;
  style?: StyleProp<ViewStyle>;
};

export default function QuizResultItem({item, style}: Props): JSX.Element {
  const {theme} = useCPK();
  const {push} = useRouter();

  return (
    <Container style={style}>
      <Typography.Body3 style={css`
        margin-bottom: 8px;
        color: ${item.quizStats.correct === 0 ? theme.text.danger : theme.text.success};
        font-weight: bold;
      `}>
        {t('quizResult.correctnessWithAttempts', {corrects: ..., attempts: ...})}
      </Typography.Body3>
      ...
    </Container>
  );
}

const Container = styled.View`
  background-color: ${({theme}) => theme.bg.paper};
  border-radius: 20px;
  padding: 16px 20px;
`;
```

Rules distilled:
1. File header JSDoc `/** @name X */` (+ Korean one-line purpose for screens), and a
   link to `hyochan/style-guide` REACT.md on reusable components.
2. `export default function Name(props: Props): JSX.Element` — explicit return type.
   `type Props = {...}` declared immediately above.
3. `styled.X` template components declared **at the bottom of the file**, after the
   component. Theme is read via the interpolation arg: `${({theme}) => theme.bg.paper}`.
4. Inline/one-off styles use `` css`...` `` from kstyled inside `style={}` — this is
   compiled to `StyleSheet.create` by `babel-plugin-kstyled`, so it is cheap.
   Style arrays are used to layer: `style={[css\`padding: 24px;\`, style]}`.
5. Dynamic values inside `css` come from `useCPK().theme` (a JS value), **not** from the
   styled-props theme — because `css` has no props context.
6. Numeric interpolation must be stringified with a unit: `${top + 'px'}`,
   `${borderRadius + 'px'}`, `${bottom + 20 + 'px'}`.
7. Every component takes an optional `style?: StyleProp<ViewStyle>` and merges it last.
8. Text always via `cpk-ui` `Typography.{Heading1..5, Body1..3}`; never raw `<Text>`
   (exception: `FallbackComponent`, deliberately dependency-free — see §10).
9. `styled.View<Props>` generic form is used when the styled component needs props:
   `const ButtonContainer = styled.View<ButtonContainerStyleProps>\`...\`` (see
   `GestureHandlerButton.tsx`).
10. Accessibility is **first-class**: `accessible`, `accessibilityLabel`,
    `accessibilityRole`, `accessibilityState`, `accessibilityLiveRegion`,
    `accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"` for
    decorative images. Label composition is factored into pure helpers under
    `src/uis/**/accessibility.ts`:
    ```ts
    export function getTabMyAccessibilityLabel({title, description, label}) {
      return [title, description, label].filter(Boolean).join(', ');
    }
    ```
    These pure helpers are then unit-tested separately (see §11).

### 7.2 Wrapping a cpk-ui primitive

`src/uis/ButtonMartie.tsx` = `cpk-ui` `Button` + press sound + a11y defaults:

```tsx
type Props = {
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  disabled?: boolean;
  onPress: () => void;
  text: string;
  touchableHighlightProps?: Omit<TouchableHighlightProps, 'onPress' | 'activeOpacity' | 'style'>;
  [key: string]: any;                    // pass-through escape hatch
};

export default function ButtonMartie({..., ...rest}: Props): JSX.Element {
  const audioPressPlayer = useAudioPlayer(AUDIO_PRESS);
  const handlePress = () => {
    if (disabled) return;
    safeSeekAudioPlayerToStart(audioPressPlayer);
    safePlayAudioPlayer(audioPressPlayer);
    onPress();
  };
  return <Button borderRadius={12} disabled={disabled} onPress={handlePress} text={text}
                 touchableHighlightProps={{...}} {...rest} />;
}
```

`src/uis/GestureHandlerButton.tsx` is the full re-implementation of cpk `Button` on top of
`RectButton` — needed because cpk `Button` loses touches inside reanimated modals. It also
demonstrates the `calculateStyles({theme, type, color, size, ...}) => Styles` helper
pattern and a `styles?: {container, content, loading, text, disabled, disabledText, hovered}`
slot-styles prop. **Keep this component in BooKoo if modals use reanimated.**

### 7.3 Skeletons (first-page loading)

`src/uis/Common/SkeletonBox.tsx` — reanimated opacity pulse, `theme.text.placeholder` fill:

```tsx
type Props = {width: DimensionValue; height: number; borderRadius?: number};
opacity.value = withRepeat(withTiming(0.7, {duration: 1000, easing: Easing.inOut(Easing.ease)}), -1, true);
```

Screen-level skeletons compose it (`src/uis/Discover/ArticleListSkeleton.tsx`) and are
returned instead of a spinner for the first page — see §9.1.

---

## 8. i18n

### 8.1 Files

`assets/langs/{en,ko,ja,de,es,fr,th,tw,vi}.json` — **9 locales**, each 31 top-level
namespaces, identical key sets. Namespaces (from `en.json`):
`adminQuizSubmissions, article, categories, categoriesMap, chat, common, daily, details,
discover, error, feather, forceUpdate, …, my, quizResult, referral, settings, signIn, …`

Interpolation syntax is `{{name}}`: `"reviewedAt": "Reviewed on {{date}}"`,
`"solveCount": "{{count}} attempts"`.

`assets/langs/meta/{ko,en,ja}.json` is separate — those are the **native store/OS metadata
locales** wired via `app.config.ts` `locales: {...}`.

### 8.2 Loader — `src/STRINGS.ts` (whole mechanism)

```ts
import * as Localization from 'expo-localization';
import {storage, Storage} from './utils/storage';

import en from '../assets/langs/en.json';
import ko from '../assets/langs/ko.json';
// ... ja, de, es, fr, th, tw, vi

// ad-hoc: https://github.com/fnando/i18n/issues/26#issuecomment-1225775247
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {I18n} = require('i18n-js/dist/require/index');
const i18n = new I18n({en, ko, ja, de, es, fr, th, tw, vi});

i18n.defaultLocale = 'en';
i18n.enableFallback = true;

const getInitialLocale = (): string => {
  const storedLocale = storage.getString(Storage.Locale);
  if (storedLocale) return storedLocale;
  return Localization.getLocales()[0].languageCode || 'en';
};

i18n.locale = getInitialLocale();

export const getLocale = (): 'en'|'ko'|'ja'|'de'|'es'|'fr'|'th'|'tw'|'vi' =>
  i18n.locale.slice(0, 2);
```

**Typed keys** — the killer feature; `t()` autocompletes every dotted path in `en.json`:

```ts
type NestedKeys<T> = T extends object
  ? {[K in keyof T]: K extends string | number
      ? `${K}` | (T[K] extends object ? `${K}.${NestedKeys<T[K]>}` : never)
      : never}[keyof T]
  : '';

export const t = (param: NestedKeys<typeof en>, mapObj?: object, locale?: string): string => {
  const currentLocale = i18n.locale;
  if (locale) i18n.locale = locale;
  const translation = i18n.t(param, mapObj);
  i18n.locale = currentLocale;            // restore — one-off locale override
  return translation;
};

export {i18n};
```

Usage everywhere: `t('my.darkMode')`, `t('referral.codeLabel', {code})`,
`t('common.dailyCheckInReward', {count: rewardCount})`.
The project rule (CLAUDE.md) is: **no `t(dynamicKey as any)`** — dynamic keys must be
resolved through an explicit `if`/`switch`.

### 8.3 `src/hooks/useLocale.ts` — reactive language switching

Because `i18n.locale` is a module global, the hook maintains its own listener array so all
mounted components re-render on change:

```ts
type SupportedLocale = 'ko'|'en'|'ja'|'de'|'es'|'fr'|'th'|'tw'|'vi';
const SUPPORTED_LOCALES: SupportedLocale[] = ['ko','en','ja','de','es','fr','th','tw','vi'];

let localeListeners: ((locale: SupportedLocale) => void)[] = [];

const getDeviceLocale = (): SupportedLocale => {
  const deviceLanguage = getLocales()[0]?.languageCode as SupportedLocale;
  return SUPPORTED_LOCALES.includes(deviceLanguage) ? deviceLanguage : 'en';
};

export const useLocale = () => {
  const [locale, setLocaleState] = useState<SupportedLocale>(() =>
    (storage.getString(Storage.Locale) as SupportedLocale) || getDeviceLocale());

  const setLocale = useCallback((newLocale: SupportedLocale) => {
    storage.set(Storage.Locale, newLocale);
    setLocaleState(newLocale);
    i18n.locale = newLocale;
    localeListeners.forEach((l) => l(newLocale));
  }, []);

  const resetToDeviceLocale = useCallback(() => { storage.delete(Storage.Locale); ... }, []);

  useEffect(() => {
    const listener = (nl: SupportedLocale) => setLocaleState(nl);
    localeListeners.push(listener);
    return () => { localeListeners = localeListeners.filter((l) => l !== listener); };
  }, []);

  return {locale, setLocale, resetToDeviceLocale, supportedLocales: SUPPORTED_LOCALES, getCurrentLocale};
};
```

**Gotcha:** `SUPPORTED_LOCALES` is duplicated in three places (`useLocale.ts`,
`STRINGS.ts` return type, and `getLanguageName()` in `app/(tabs)/my.tsx`). BooKoo should
define the list once and derive.

### 8.4 Language picker UI (`app/(tabs)/my.tsx`)

Uses `@expo/react-native-action-sheet`; the current language is hoisted to index 0 and a
parallel `localeMapping` array maps button index → locale code:

```tsx
const {showActionSheetWithOptions} = useActionSheet();
const {locale, setLocale, supportedLocales} = useLocale();

const getLanguageName = (localeCode: string): string => {
  switch (localeCode) {
    case 'ko': return t('settings.korean');
    case 'en': return t('settings.english');
    case 'ja': return t('settings.japanese');
    ... case 'tw': return t('settings.traditionalChinese');
    default:   return t('settings.english');
  }
};

const otherLocales = supportedLocales.filter((loc) => loc !== locale);
const localeMapping = [locale, ...otherLocales];
const options = [getLanguageName(locale), ...otherLocales.map(getLanguageName), t('common.cancel')];
showActionSheetWithOptions({options, cancelButtonIndex: options.length - 1,
                            title: t('settings.language')},
  (buttonIndex) => { ... setLocale(localeMapping[buttonIndex]); });
```

### 8.5 i18n lint enforcement (`.eslintrc.js`)

```js
extends: ['expo', 'prettier', 'plugin:i18n-json/recommended'],
rules: {
  'i18n-json/identical-keys': [2, {filePath: path.resolve('./assets/langs/ko.json')}],
  'i18n-json/sorted-keys':    [2, {order: 'asc', indentSpaces: 2}],
  'i18n-json/valid-message-syntax': [2, {syntax: path.resolve('./custom-syntax-validator.ts')}],
}
```
Script: `"lint:i18n": "eslint --fix --ext .json --format node_modules/eslint-plugin-i18n-json/formatter.js assets/langs/"`,
and `"lint:all": "bun lint && bun lint:i18n"`.
**`ko.json` is the reference file** — every other locale must have identical keys, sorted asc.

---

## 9. Unbounded lists: FlashList + `usePaginatedQuery` + `onEndReached`

This is the single most important section for BooKoo (the legacy app got slow as ledgers grew).

### 9.0 The written rule (verbatim from Martie `CLAUDE.md` and `AGENTS.md`)

> ## List & Pagination Rules
> - Any list backed by user-generated, server-side, or otherwise unbounded data must use
>   `FlashList` from `@shopify/flash-list`.
> - Do not render unbounded data with `ScrollView + array.map()` or fetch the full
>   collection with `useQuery`/Convex `.collect()` for screen lists.
> - Pair `FlashList` with Convex pagination (`paginationOptsValidator` on the query,
>   `usePaginatedQuery` on the client) and load more via `onEndReached`.
> - `ScrollView` is only acceptable for static/short-form content, fixed-size controls,
>   forms, detail pages, or deliberately capped preview sections such as "top 5".
> - If a query can grow over time, add the right index for the list sort/filter before
>   adding pagination.

Copy this rule block into BooKoo's `CLAUDE.md` verbatim.

### 9.1 Full reference implementation — `app/hall-of-fame.tsx` (complete list screen)

```tsx
import {useCallback} from 'react';
import {ActivityIndicator, View} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import {Stack} from 'expo-router';
import {Typography, useCPK} from 'cpk-ui';
import {css} from 'kstyled';
import {PaginatedQueryReference, usePaginatedQuery} from 'convex/react';
import {api} from '../convex/_generated/api';
import type {Doc} from '../convex/_generated/dataModel';
import {t} from '../src/STRINGS';

const PAGE_SIZE = 30;

type RankItem = Doc<'ranks'> & {user: Doc<'userProfiles'> | null};

export default function HallOfFame(): JSX.Element {
  const {theme} = useCPK();

  const {results, status, loadMore} = usePaginatedQuery(
    api.rank.queries.getPaginatedRanks as unknown as PaginatedQueryReference,
    {},
    {initialNumItems: PAGE_SIZE},
  );

  const handleLoadMore = useCallback(() => {
    if (status === 'CanLoadMore') loadMore(PAGE_SIZE);
  }, [loadMore, status]);

  const renderItem = useCallback(
    ({item, index}: {item: RankItem; index: number}) => (
      <View
        accessible
        accessibilityLabel={[`${index + 1}${t('common.rank')}`, item.user?.displayName,
                             `${item.correctCount}`].filter(Boolean).join(', ')}
        style={css`
          flex-direction: row; align-items: center;
          padding: 16px 20px; gap: 16px;
          border-bottom-width: 1px;
          border-bottom-color: ${theme.role.border};
          background-color: ${theme.bg.basic};
        `}
      >
        ...
      </View>
    ),
    [theme],                                   // <- renderItem memoized on theme only
  );

  if (status === 'LoadingFirstPage' && results.length === 0) {
    return (
      <View style={css`flex: 1; align-items: center; justify-content: center;
                       background-color: ${theme.bg.basic};`}>
        <Stack.Screen options={{title: t('my.hallOfFame')}} />
        <ActivityIndicator color={theme.role.primary} />
      </View>
    );
  }

  return (
    <View style={css`flex: 1; background-color: ${theme.bg.basic};`}>
      <Stack.Screen options={{title: t('my.hallOfFame')}} />
      <FlashList
        data={results as RankItem[]}
        renderItem={renderItem}
        keyExtractor={(item) => item._id}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={<View style={css`padding: 20px; background-color: ${theme.bg.paper};`}>...</View>}
        ListFooterComponent={
          status === 'LoadingMore'
            ? <ActivityIndicator color={theme.role.primary} style={css`padding: 20px;`} />
            : null
        }
      />
    </View>
  );
}
```

### 9.2 Variant with filters + a secondary batched query — `app/_Tabs/TabArticle/TabArticleMobile.tsx`

```tsx
const LIST_SIZE = 20;

const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

const {results: articles, status, loadMore, isLoading} = usePaginatedQuery(
  api.article.queries.listPaginated as unknown as PaginatedQueryReference,
  {categoryName: selectedCategory ?? undefined},        // filter arg resets pagination
  {initialNumItems: LIST_SIZE},
);

// Batch-fetch translated strings for the CURRENT page only, not the whole table:
const articleKeys = useMemo(
  () => (articles as ArticleListItem[]).flatMap((a) => [`${a.key}_title`, `${a.key}_summary`]),
  [articles],
);
const langData = useQuery(
  api.articleLanguage.queries.getByKeysAndLanguage,
  articleKeys.length > 0 ? {keys: articleKeys, language: articleLang} : 'skip',
);
const langMap = useMemo(() => {
  if (!langData) return new Map<string, string>();
  const map = new Map<string, string>();
  for (const item of langData) map.set(item.key, item.value);
  return map;
}, [langData]);

const handleLoadMore = useCallback(() => {
  if (status === 'CanLoadMore') loadMore(LIST_SIZE);
}, [loadMore, status]);

const keyExtractor = useCallback((item: ArticleListItem) => item._id, []);

const renderHeader = useCallback(() => (...), [selectedCategory, theme, ...]);
const renderEmpty  = useCallback(() => {
  if (status === 'LoadingFirstPage' || isLoading) return null;    // don't flash "empty"
  return <View style={css`align-items:center; justify-content:center; padding:40px;`}>
           <Typography.Body2 style={css`color: ${theme.text.placeholder};`}>
             {t('article.empty')}
           </Typography.Body2>
         </View>;
}, [isLoading, status, theme.text.placeholder]);
const renderFooter = useCallback(() => {
  if (isLoading && status === 'LoadingMore')
    return <View style={css`padding:20px; align-items:center;`}>
             <ActivityIndicator size="small" color={theme.role.primary} /></View>;
  return <View style={css`height: 20px;`} />;      // bottom spacer when idle
}, [isLoading, status, theme.role.primary]);

if (status === 'LoadingFirstPage' && articles.length === 0) return <ArticleListSkeleton />;

return (
  <FlashList
    data={articles as ArticleListItem[]}
    keyExtractor={keyExtractor}
    renderItem={renderItem}
    ListHeaderComponent={renderHeader}
    ListEmptyComponent={renderEmpty}
    ListFooterComponent={renderFooter}
    onEndReached={handleLoadMore}
    onEndReachedThreshold={0.5}
    contentContainerStyle={css`padding-bottom: 20px;`}
  />
);
```

Key perf details:
- `renderItem`, `keyExtractor`, `renderHeader/Empty/Footer`, `handleLoadMore` are **all**
  `useCallback`-memoized, with **narrow theme deps** (`theme.bg.paper`, `theme.role.primary`,
  … listed individually rather than the whole `theme` object where practical).
- Category chips are a horizontal `ScrollView` **inside `ListHeaderComponent`** so they
  scroll with the list and cost nothing per row.
- `langData` is fetched for the *current page's keys only* via `'skip'` + batched
  `getByKeysAndLanguage` — never a full-table query.

### 9.3 Domain hook wrapping `usePaginatedQuery` — `src/hooks/useQuizzes.ts`

```ts
export const useQuizzes = (initialNumItems: number = QUIZ_LIMIT) => {
  const rawLocale = getLocale();
  const language = (['en','ko','ja'].includes(rawLocale) ? rawLocale : 'en') as SupportedLanguage;

  const currentUser = useQuery(api.user.queries.currentUser);
  const {lastQuizKeyCursor: localStoreCursor} = useQuizStore();
  const cursor = currentUser ? currentUser?.lastQuizCursor : localStoreCursor || undefined;

  const {results: quizItems, status, loadMore, isLoading: isPaginationLoading} =
    usePaginatedQuery(
      api.quiz.queries.getQuizzesPaginated as PaginatedQueryReference,
      {language, lastKey: cursor,
       paginationOpts: {initialNumItems: Math.min(initialNumItems, QUIZ_LIMIT)}},
      {initialNumItems: Math.min(initialNumItems, QUIZ_LIMIT)},
    );

  const quizzes = useMemo(() => quizItems || [], [quizItems]);

  const loadNextPage = useCallback((additionalItems: number = QUIZ_LIMIT) => {
    try {
      if (status === 'CanLoadMore') loadMore(Math.min(additionalItems, QUIZ_LIMIT));
      else if (status === 'Exhausted') {/* no-op */}
    } catch (error) { logError(error, 'useQuizzes.loadNextPage'); }
  }, [status, loadMore]);

  return {
    quizzes, isLoading: isPaginationLoading, loadNextPage,
    lastQuiz: quizzes[quizzes.length - 1],
    hasNextPage: status === 'CanLoadMore',
    hasCompletedQuizzes: !!hasCompletedQuizzes,
    paginationStatus: {
      status,
      isLoading: status === 'LoadingMore' || status === 'LoadingFirstPage',
      isPaginationDone: status === 'Exhausted',
    },
    currentCursor: cursor,
  };
};
```

### 9.4 The four `usePaginatedQuery` statuses (used consistently)

| status | UI |
|---|---|
| `'LoadingFirstPage'` | full-screen skeleton (`ArticleListSkeleton`) or centered `ActivityIndicator`; also suppress `ListEmptyComponent` |
| `'CanLoadMore'` | the only state in which `onEndReached` calls `loadMore(PAGE_SIZE)` |
| `'LoadingMore'` | small `ActivityIndicator` in `ListFooterComponent` |
| `'Exhausted'` | footer becomes a fixed-height spacer `<View style={css\`height: 20px;\`} />` |

### 9.5 All FlashList sites in Martie (for BooKoo's audit checklist)

| file | paginated? |
|---|---|
| `app/hall-of-fame.tsx` | yes (`getPaginatedRanks`, PAGE_SIZE 30) |
| `app/quiz-results.tsx` | yes (`quizResult.query.getPaginatedResults`, LIST_SIZE 20) |
| `app/my-quizzes.tsx` | yes |
| `app/admin-quiz-submissions.tsx` | yes |
| `app/_Tabs/TabArticle/TabArticleMobile.tsx` | yes (`article.queries.listPaginated`, 20) |
| `app/league.tsx`, `app/categories.tsx`, `app/login-info.tsx` | FlashList, bounded data |
| `app/chat.tsx` | FlashList with `FlashListRef<ChatMessage>` + `KeyboardAvoidingView` from `react-native-keyboard-controller` |
| `app/_Tabs/TabMy/TabMy{Mobile,Tablet}.tsx` | FlashList over the `Section[]` settings array (+ `extraData={expandedIndex}`) |

Notes:
- FlashList **v2** — no `estimatedItemSize` anywhere; do not add it.
- `extraData` is required whenever `renderItem` closes over local state
  (`extraData={expandedIndex}`).
- `removeClippedSubviews={false}` appears once (`app/quiz-results.tsx`) to fix clipping.
- `contentContainerStyle` accepts a kstyled `` css`` `` value directly.
- Even the *settings screen* uses FlashList instead of `ScrollView + map`.

---

## 10. Error handling

### 10.1 Two `ErrorBoundary` layers (`react-native-error-boundary@3.1.0`)

1. **App-wide**, inside `RootProvider` (`src/providers.tsx`):
   `<ErrorBoundary FallbackComponent={FallbackComponent} onError={handleErrorConsole}>`
2. **Scoped**, around a single risky overlay in `app/_layout.tsx`:
   ```tsx
   function EmptyFallback(): null { return null; }
   <ErrorBoundary FallbackComponent={EmptyFallback} onError={handleGrowtokiBoundaryError}>
     <StreakRecoveryModal onVisibilityChange={setStreakRecoveryModalVisible} />
   </ErrorBoundary>
   ```
   i.e. a non-essential feature that crashes renders **nothing** rather than taking down
   the app. Great pattern for BooKoo's optional widgets.
3. **HOC** for per-screen wrapping — `src/hoc/withErrorBoundary.tsx`:
   ```tsx
   export function withErrorBoundary<P extends object>(
     WrappedComponent: React.ComponentType<P>,
   ): React.ComponentType<P> {
     return function WithErrorBoundaryComponent(props: P) {
       return (
         <ErrorBoundary FallbackComponent={FallbackComponent} onError={handleGrowtokiBoundaryError}>
           <WrappedComponent {...props} />
         </ErrorBoundary>
       );
     };
   }
   ```

### 10.2 `src/utils/error.ts` (entire file, minus the growtoki import)

```ts
type ErrorWithMessage = {message: string};

function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
  return typeof error === 'object' && error !== null && 'message' in error
      && typeof (error as Record<string, unknown>).message === 'string';
}

function toErrorWithMessage(maybeError: unknown): ErrorWithMessage {
  if (isErrorWithMessage(maybeError)) return maybeError;
  try { return new Error(JSON.stringify(maybeError)); }
  catch { return new Error(String(maybeError)); }
}

export const handleErrorConsole = (error: unknown, componentStack?: string): string => {
  const errorMessage = toErrorWithMessage(error).message;
  captureGrowtokiCrash(error, {source: 'react_error_boundary', component_stack: componentStack});
  if (process.env.NODE_ENV !== 'production') console.error(error);
  return errorMessage;
};

export const logError = (error: unknown, jsErrorName?: string) => {
  captureGrowtokiError(error, {js_error_type: jsErrorName});
  if (__DEV__) console.error(error);
};
```

**`logError(error, 'snake_case_tag')` is the universal catch-block call.** Tags observed:
`'iap_initialization_error'`, `'admob_request_configuration_set_error'`, `'reloadAsync'`,
`'applyUpdate'`, `'share-referral'`, `'generate-referral-code'`,
`'useQuizzes.loadNextPage'`, `'QuizView.handleAnswerPress'`,
`'QuizView.handleContinuePress'`, `'admob_banner_load_error'`.
Convention: either a `snake_case` event name or a `Module.method` path.

For BooKoo: keep `error.ts` with the same two exports and the same
`isErrorWithMessage`/`toErrorWithMessage` guards; just swap `captureGrowtoki*` for whatever
(or nothing).

### 10.3 `src/uis/FallbackComponent.tsx`

Deliberately **dependency-free at render time**: plain RN `View/Text/Pressable`,
`StyleSheet.create` with **hardcoded hex colors** (no theme), so it still renders when the
theme provider itself is what blew up. Only `t()` and `expo-updates`/`Linking` are used.

Two actions:
```tsx
const handleReload   = useCallback(() => { void reloadAsync().catch(() => {}); }, []);
const handleOpenStore = useCallback(() => {
  const appStoreUrl = Platform.select({...APP_STORE_URLS, web: MARTIE_SHARE_URL, default: MARTIE_SHARE_URL});
  if (!appStoreUrl) return;
  void Linking.openURL(appStoreUrl).catch(() => {});
}, []);
```
Strings: `t('error.title')`, `t('error.message')`, `t('error.updateMessage')`,
`t('error.updateButton')`, `t('error.tryAgain')`.

Other error-adjacent utils: `src/utils/crashReporting.ts`
(`installGrowtokiGlobalErrorHandler`, `handleGrowtokiBoundaryError`) and
`src/utils/crashSentinel.ts` (`reportPendingCrashSentinel`, `clearCrashSentinel(tag)` — a
"did we crash on the last transition" breadcrumb, cleared on the target screen's mount).

---

## 11. Tests

### 11.1 `jest.config.ts` (root, TS config exporting an async factory)

```ts
process.env.TZ = 'Asia/Seoul';

export default async (): Promise<Config.InitialOptions> => ({
  automock: false,
  resetMocks: false,
  preset: 'jest-expo',
  transform: {'^.+\\.(js|jsx|ts|tsx)$': 'babel-jest'},
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|standard-navigation|@unimodules/.*|unimodules|native-base|react-native-svg|cpk-ui|@cpk-ui|immer|zustand)',
  ],
  modulePaths: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
  moduleFileExtensions: ['js', 'ts', 'tsx', 'svg', 'png', 'json'],
  modulePathIgnorePatterns: ['<rootDir>/build/', '<rootDir>/node_modules/', '<rootDir>/.history/'],
  moduleNameMapper: {
    '\\.svg': '<rootDir>/__mocks__/svgMock.js',
    '.+\\.(css|style|less|sass|scss|png|jpg|ttf|woff|woff2)$': 'babel-jest',
    '^convex/react$': '<rootDir>/__mocks__/convex/react.ts',
    '^react-native-worklets$': '<rootDir>/__mocks__/react-native-worklets.js',
    '^react-native-reanimated$': '<rootDir>/__mocks__/react-native-reanimated.js',
  },
  setupFiles: ['<rootDir>/test/testSetup.ts',
               './node_modules/react-native-gesture-handler/jestSetup.js'],
  cacheDirectory: '.jest/cache',
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect', './test/testSetupAfterEnv.ts'],
  haste: {defaultPlatform: 'ios', platforms: ['android', 'ios', 'native']},
  coveragePathIgnorePatterns: ['/node_modules/'],
  forceExit: true,
  watchman: false,
});
```

Script: `"test": "jest --runInBand"`.

**`cpk-ui`, `immer`, `zustand` and `react-native-svg` MUST be in `transformIgnorePatterns`'
negative lookahead** (they ship ESM). Note the `moduleNameMapper` entry points at
`__mocks__/convex/react.ts` while the file on disk is `__mocks__/convex/react.tsx` —
resolution still works via `moduleFileExtensions`, but BooKoo should make them match.

### 11.2 `test/testSetup.ts` (setupFiles — runs before the framework)

```ts
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
customGlobal.fetch = require('jest-fetch-mock');
customGlobal.fetchMock = customGlobal.fetch;
global.__reanimatedWorkletInit = jest.fn();

jest.mock('expo-router');                               // automock
jest.mock('@expo/react-native-action-sheet');
jest.mock('expo-font', () => ({useFonts: () => []}));
jest.mock('expo-audio', () => ({useAudioPlayer: jest.fn()}));
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);
jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter');
jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));

jest.mock('convex/react', () => ({
  ConvexProvider: ({children}: {children: React.ReactNode}) => children,
  ConvexReactClient: jest.fn().mockReturnValue({}),
}));

// [ANALYTICS/ADS/IAP — droppable for BooKoo]
jest.mock('@react-native-firebase/analytics', () => ({getAnalytics: jest.fn(() => ({})), logEvent: jest.fn(() => Promise.resolve()), setUserId: jest.fn(), setUserProperties: jest.fn(() => Promise.resolve()), logScreenView: jest.fn(() => Promise.resolve())}));
jest.mock('react-native-google-mobile-ads', () => ({...}));
jest.mock('@notifee/react-native', () => ({...}));
jest.mock('expo-iap', () => ({useIAP: jest.fn(), requestPurchase: jest.fn(), ...}));
```

### 11.3 `test/testSetupAfterEnv.ts` (entire file)

```ts
import {cleanup} from '@testing-library/react-native';
afterEach(cleanup);
process.on('unhandledRejection', (err) => { fail(err); });
```

### 11.4 `test/testUtils.tsx` — the render harness

```tsx
export const createTestElement = (
  child: JSX.Element,
  mockContext?: MockContext,
  themeType?: AppThemeType,
): JSX.Element => <RootProvider initialThemeType={themeType}>{child}</RootProvider>;

export const createTestProps = (obj?: Record<string, unknown>) => ({
  navigation: {navigate: jest.fn(), goBack: jest.fn()},
  ...obj,
});

export function createMockNavigation(): any { /* every navigation method as jest.fn() */ }

export function TestSafeAreaProvider({children}: {children: JSX.Element}): JSX.Element {
  return (
    <SafeAreaProvider initialMetrics={{frame: {x:0,y:0,width:0,height:0},
                                       insets: {top:0,left:0,right:0,bottom:0}}}>
      {children}
    </SafeAreaProvider>
  );
}
```

### 11.5 Test tree (`test/`, 69 files)

```
test/app/*.test.tsx           screen smoke + behavior tests (one per route)
test/app/*Accessibility.test.tsx   a11y-label assertions
test/src/uis/*.test.tsx       component tests
test/src/hooks/*.test.tsx     hook tests
test/src/utils/*.test.ts      pure-logic unit tests
test/phase1|phase2|phase3/*.test.ts  domain-rule unit tests (streak, league, referral, …)
test/plugins/*.test.ts        expo config-plugin tests
```

### 11.6 The two component-test shapes

**(a) Smoke test via the real provider tree** — `test/app/index.test.tsx` (entire file):

```tsx
import 'react-native';
import type {RenderAPI} from '@testing-library/react-native';
import {render, waitFor} from '@testing-library/react-native';
import Page from '../../app/(tabs)/index';
import {createTestElement, createTestProps} from '../testUtils';

let props: any; let component: JSX.Element; let testingLib: RenderAPI;

describe('Rendering', () => {
  beforeEach(() => {
    props = createTestProps();
    component = createTestElement(<Page {...props} />);
  });

  it('renders without crashing', async () => {
    testingLib = render(component);
    const baseElement = await waitFor(() => testingLib.toJSON());
    expect(baseElement).toBeTruthy();
  });
});
```

**(b) Fully mocked behavior test** — `test/src/uis/ButtonMartie.test.tsx`: mocks `cpk-ui`
down to a `TouchableOpacity`, mocks `expo-audio`, mocks the sibling utils, then asserts
behavior + a11y:

```tsx
jest.mock('cpk-ui', () => {
  const React = jest.requireActual('react');
  const {Text, TouchableOpacity} = jest.requireActual('react-native');
  return {Button: ({accessibilityLabel, text, touchableHighlightProps, ...props}) =>
    React.createElement(TouchableOpacity,
      {accessibilityLabel: accessibilityLabel ?? text, accessibilityRole: 'button',
       ...props, ...touchableHighlightProps},
      React.createElement(Text, null, text))};
});

it('announces the visible text as a button by default', () => {
  const {getByLabelText} = render(<ButtonMartie onPress={mockOnPress} text="Continue" />);
  const button = getByLabelText('Continue');
  expect(button.props.accessibilityRole).toBe('button');
  fireEvent.press(button);
  expect(mockSafeSeekAudioPlayerToStart).toHaveBeenCalledWith(mockAudioPlayer);
  expect(mockOnPress).toHaveBeenCalledTimes(1);
});
```

**(c) Layout/structure test** — `test/app/tabs-layout.test.tsx` mocks `expo-router/js-tabs`
with a spy `Tabs` + `Tabs.Screen`, mocks `cpk-ui`'s `useCPK`, `convex/react`,
`convex/_generated/api`, stores and analytics, then asserts:

```tsx
const TabLayout = jest.requireActual<{default: React.ComponentType}>('../../app/(tabs)/_layout').default;
const {getByLabelText} = render(<TabLayout />);
expect(getByLabelText('tab navigator')).toBeTruthy();
expect(mockTabs).toHaveBeenCalledWith(expect.objectContaining({initialRouteName: 'index'}), undefined);
expect(mockTabsScreen.mock.calls.map(([props]) => props.name)).toEqual(['index','articles','my']);
```

Elements queried by `getByLabelText(...)` (a11y label), rarely by testID — a11y labels are
the test seam. `testID` used sparingly (`'header-wordmark'`, `'header-bulb-icon'`,
`'button-container'`, `'loading-view'`).

### 11.7 `__mocks__/`

```
__mocks__/convex/react.tsx        -> exports a stub ConvexReactClient class only
__mocks__/convex/http.ts
__mocks__/expo-asset.ts
__mocks__/expo-localization.ts    -> getLocales() => [{languageCode:'en', languageTag:'en-US', ...}]
__mocks__/react-native-reanimated.js  -> useSharedValue/useAnimatedStyle/withTiming... identity impls
__mocks__/react-native-worklets.js
__mocks__/sentry-expo.ts
__mocks__/svgMock.js              (referenced by moduleNameMapper)
```

`__mocks__/convex/react.tsx`, in full:

```ts
export class ConvexReactClient {
  constructor(public url: string, public options: {unsavedChangesWarning: boolean}) {}
}
```

`__mocks__/react-native-reanimated.js` shape:

```js
const useSharedValue = (init) => ({value: init});
const useAnimatedStyle = (fn) => fn();
module.exports = {
  __esModule: true,
  default: {createAnimatedComponent: (c) => c, View, Text, Image, ScrollView: View, FlatList: View},
  useSharedValue, useAnimatedStyle, useDerivedValue, useAnimatedScrollHandler, useAnimatedRef,
  withTiming: (toValue) => toValue, withSpring: (toValue) => toValue,
  withDelay: (_, animation) => animation,
  withSequence: (...args) => args[args.length - 1],
  withRepeat: (animation) => animation, ...
};
```

---

## 12. Analytics / Ads / IAP — **OPTIONAL, drop for BooKoo**

Everything in this section is Martie-specific monetization/growth plumbing. BooKoo (a
shared household ledger) needs none of it. Listed so the rewrite can explicitly *not* port it.

### DROP list — packages
`@react-native-firebase/app`, `@react-native-firebase/analytics`, `growtoki`,
`react-native-google-mobile-ads`, `expo-iap`, `expo-tracking-transparency`,
`@notifee/react-native`, `expo-audio` (press sounds), `react-native-view-shot` +
`expo-sharing` (share cards), `lottie-react-native`, `expo-ondevice-ai`.

### DROP list — files
```
src/utils/analytics.ts            LOG_EVENTS (~45 events), GROWTOKI_EVENTS, logEvent,
                                  logScreenView, setUser, updateUserAnalyticsProperties,
                                  registerAnalyticsSuperProperties, flushQueuedAnalyticsEvent
src/utils/growtoki.ts             client bridge, captureGrowtokiError/Crash
src/utils/crashReporting.ts       installGrowtokiGlobalErrorHandler, handleGrowtokiBoundaryError
src/utils/crashSentinel.ts        reportPendingCrashSentinel, clearCrashSentinel
src/utils/acquisition.ts          ACQUISITION_CHANNELS, setAcquisitionSourceOnce, …
src/utils/signupCompletion.ts     pending-signup delivery retry machinery
src/utils/ads.ts, bannerAds.ts, mobileAdsConfig{,.native,.web}.ts
src/uis/BannerAdmob.tsx{,.web.tsx}, src/features/adReward/AdmobReward.tsx{,.web.tsx}
src/utils/iap.ts (`export * from 'expo-iap'`), iap.web.ts, iapEntitlements.ts
src/stores/iapStore.ts, most of src/stores/userStore.ts (checkPremium)
src/utils/appReview.ts, notifee.ts, socialShare.ts, storeLinks.ts
app/purchase.tsx, app/purchase-iapkit.tsx, app/ad-rewarded/index.tsx
src/uis/ShareCard/*
docs/ANALYTICS_EVENT_SCHEMA.md, docs/AD_PROVIDER_GUIDE.md, docs/GROWTH_ACTION_PLAN.md
```

### DROP list — `app/_layout.tsx` code to delete when porting
- `installGrowtokiGlobalErrorHandler()`, `reportPendingCrashSentinel()`,
  `configureMobileAdsRequest()`, `appModuleStartedAt` timing.
- `GrowtokiRootProvider` / `GrowtokiClientBridge` wrappers.
- `attemptPendingSignupCompletionDelivery` (`useEffectEvent`) + its two effects.
- The whole session-lifecycle effect (`SESSION_END_GRACE_MS = 30_000`, `bucketDuration`,
  `startSession/endSession/scheduleEnd`).
- Acquisition-source `Linking` capture effects — **keep the `Linking` listener skeleton**
  if BooKoo wants invite deep-links, drop the analytics payload.
- `useIAP()` / `checkPremium()` effect, `<BannerAdmob />`, `shouldShowBannerAd(...)`, and
  the `bottom`-inset spacer that exists only to reserve ad space.
- `EmptyFallback` + the growtoki error boundary → keep the boundary, drop the handler.

### KEEP (the parts that are not monetization)
`useEASUpdate`, `ForceUpdateModal`, `SignInRequireModal`, `DisplayNameModal`,
`<Toasts />`, `ErrorBoundary`/`FallbackComponent`, `logError`, `useNotificationPermissionFlow`
(if BooKoo ships reminders), `useSafeAreaInsets` bottom spacer (as plain safe-area padding).

`shouldShowBannerAd` is a tiny pure fn worth reading for the "which routes get bottom
chrome" idea:

```ts
const BANNER_AD_SUPPORTED_PATHS = new Set(['/', '/articles', '/my']);
export function shouldShowBannerAd(pathname, isPremium, hasBlockingOverlay = false) {
  return !isPremium && !hasBlockingOverlay && BANNER_AD_SUPPORTED_PATHS.has(pathname);
}
```

---

## 13. Build / tooling config to copy

`babel.config.js` (entire file) — **`babel-plugin-kstyled` must come before the worklets plugin**:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['babel-plugin-kstyled', {debug: false, strict: true}],
      // Reanimated v4 moved the Babel plugin to react-native-worklets
      'react-native-worklets/plugin',
    ],
  };
};
```

`metro.config.js`:

```js
const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('cjs', 'mjs');
config.resolver.blockList = [...(config.resolver.blockList || []), new RegExp(programsPath + '/.*')];
```

`tsconfig.json` highlights: `extends: 'expo/tsconfig.base'`, `strict: true`,
`useUnknownInCatchVariables: true`, `moduleResolution: 'Bundler'`,
`paths: {'@/*': ['./*']}`, `typeRoots` includes `expo-router/ts-declarations`,
`files: ['environment.d.ts', 'src/styled.d.ts']`, and the `typescript-styled-plugin`
with RN-specific `validProperties` whitelist (`shadow-color`, `padding-horizontal`,
`aspect-ratio`, `elevation`, …).

`.prettierrc.js`:

```js
module.exports = {
  trailingComma: 'all',
  arrowParens: 'always',
  singleQuote: true,
  jsxSingleQuote: false,
  bracketSpacing: false,     // <- note: {foo} not { foo }
};
```

`app.config.ts` structural notes for BooKoo:
- `import 'dotenv/config'` + `expand(dotenv.config({path: './.env.' + process.env.STAGE, override: true}))`
  → `.env.{development,local,preview,prod,production,sample}` + `STAGE` env var pattern.
- `version` imported from `package.json`.
- `experiments: {typedRoutes: true}`.
- `userInterfaceStyle: 'automatic'` (iOS) and `android.userInterfaceStyle: 'automatic'`.
- `ios.supportsTablet: true` — **required for the tablet layouts to matter**.
- `orientation: 'default'` (allows landscape → tablet layouts actually get used).
- `expo-font` config plugin lists both app fonts and the four **cpk-ui** font files
  (`node_modules/cpk-ui/components/uis/Icon/{cpk.ttf,Pretendard-Bold.otf,Pretendard-Regular.otf,Pretendard-Thin.otf}`)
  so they are embedded natively.
- `expo-splash-screen` plugin with `{image, backgroundColor: '#EFEFEF', dark: {backgroundColor: '#232323'}, imageWidth: 240}`.
- `react-native-edge-to-edge` plugin.
- `locales: {ko, en, ja: './assets/langs/meta/*.json'}` for store/OS strings.

Also present: `commitlint.config.cjs` (+ `@commitlint/config-conventional`), `.husky/`,
`.ncurc.json`, `AGENTS.md` (Angular Conventional Commits, branch prefixes
`feat/ bugfix/ docs/ refactor/ test/ chore/`, never tool-vendor prefixes).

TypeScript rules from `CLAUDE.md` worth carrying over verbatim:
- **`any` 사용 절대 금지** — use concrete types, `unknown`, generics, type guards.
- Convex ids as `Id<'tableName'>` from `convex/_generated/dataModel`.
- expo-router paths as string literals, never `as any` (typed routes are on).
- No `t(dynamicKey as any)`; branch instead.
- Verify with `npx tsc --noEmit`.

---

## 14. Straight-to-BooKoo checklist

**Copy as-is (modulo renaming):**
- `src/providers.tsx`, `src/theme.ts`, `src/styled.d.ts`, `src/utils/storage.ts`,
  `src/utils/error.ts`, `src/utils/createCtx.tsx`, `src/hooks/useEASUpdate.ts`,
  `src/hooks/useAsync.ts`, `src/hooks/useAppState.ts`, `src/hooks/useLocale.ts`,
  `src/STRINGS.ts`, `src/uis/FallbackComponent.tsx`, `src/uis/Common/SkeletonBox.tsx`,
  `src/uis/ListEmptyItem.tsx`, `src/hoc/withErrorBoundary.tsx`,
  `test/testUtils.tsx`, `test/testSetupAfterEnv.ts`, `jest.config.ts`,
  `babel.config.js`, `.prettierrc.js`, the `.eslintrc.js` i18n rules.
- The `app/_Tabs/` directory convention and the `isTablet ? Tablet : Mobile` split.
- The `Wrapper{align-items:center} > Content{max-width:700px;width:100%}` tablet shell.
- The FlashList + `usePaginatedQuery` + `onEndReached` recipe, and the
  "List & Pagination Rules" block in `CLAUDE.md`/`AGENTS.md`.

**Fix while porting:**
1. Tri-state theme (`'light'|'dark'|'system'`) so OS dark mode is followed by default;
   pass `initialThemeType={undefined}` for `'system'`.
2. Read the theme key reactively at the root (`useMMKVBoolean`/`useMMKVString`) so the
   status bar and `SystemUI` background stay in sync.
3. Single source of truth for the supported-locale list (currently duplicated 3×).
4. Do not duplicate 500-line Mobile/Tablet screens; prefer the wrapper/alias variants.
5. Make `__mocks__/convex/react.*` extension match the `moduleNameMapper` entry.
6. Consistent store exports (all named, `useXStore`), no `.tsx` for JSX-less stores.
7. `@convex-dev/auth` should be a **dependency**, not a devDependency.
8. BooKoo ledgers are unbounded *and* aggregated — plan Convex indexes + paginated queries
   for every ledger/transaction list up front, and keep monthly totals as denormalized
   documents rather than re-summing pages on the client.
