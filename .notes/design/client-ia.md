# DESIGN — Client Information Architecture

Routes, screens, navigation, layout, theming, state, performance, components.

**Status:** normative implementation annex for the `app/` and `src/` trees.
`app-shell-and-screens.md` owns the G22 acceptance contract; this document supplies its complete route,
screen, layout, query-budget, and component detail. Both are subordinate to `.notes/design/SCHEMA.md`
(data + query names) and `.notes/DECISIONS.md` (stack).

**Sources consumed:** `SCHEMA.md` (esp. §3.5 `ledgers`, §3.10 `ledgerItems`, §3.19 constants,
**§4 READ PATH**, §5.1 write path), `auth-onboarding.md` (§9 onboarding gate, §13 cold start,
§14 app lock), `sharing-invites.md` (§2.4 deep-link flow, §7 client surface),
`error-handling.md` (shared wire contract, client surfaces, retry, render boundaries),
`legacy-feature-contracts.md` (G23–G31 photo/location/stats/search/tutorial/content/settings/theme),
`calendar-component.md` (§6.2 tablet split, §7.5 `<LedgerCalendar>`),
`money-categories-i18n.md` (§1.7 display rules, §2.4 icons, §3.1/§3.4 i18n),
`research/01-legacy-features.md` (every legacy screen), `research/07-martie-client-arch.md`
(provider order, `app/_Tabs/` split, FlashList + `usePaginatedQuery`), `research/11-cpk-ui-api.md`,
`research/12-kstyled-api.md`, `research/13-convex-scale.md` §7.

**Naming convention used throughout.** `SCHEMA.md` §4 writes query references in the short form
`api.items.list`. The house layout (note `09` §2: `convex/<domain>/{queries,mutations,actions}.ts`)
expands every one of them to `api.<domain>.queries.<name>`. So `api.items.list` in `SCHEMA.md` §4 **is**
`api.items.queries.list` on the client. This document uses the expanded form; the short form in
`SCHEMA.md` is not a second function.

---

## 0. The five decisions this document makes

| #   | Decision                                                                                                                                                                                      | One-line reason                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **The drawer is deleted.** Bottom tabs on phone, a permanent left rail on tablet.                                                                                                             | The legacy drawer carried three unrelated jobs (ledger switch, profile, settings); only ledger switching is frequent, and a hidden gesture-only surface is the wrong home for the app's most-used control.                             |
| D2  | **The active ledger is app state, not a route segment** (`activeLedgerId` in zustand, mirrored to MMKV). Ledger-scoped _admin_ screens still take `[ledgerId]` in the path.                   | Tabs must preserve scroll/pagination across switches; nesting all four tabs under `[ledgerId]` would remount them. Admin screens are deep-linkable and shareable, so they carry the id.                                                |
| D3  | **Ledger switching lives in a bottom sheet opened from the header title**, plus a full `/ledgers` management route.                                                                           | One tap from every ledger-scoped screen, discoverable (the title carries a chevron), and it is the same surface on phone and tablet-portrait.                                                                                          |
| D4  | **The ledger accent (legacy `info.color` 0..5) is NOT a theme token.** It is a per-ledger `AccentSet` resolved by `useLedgerAccent()` and applied to identity surfaces only — never to money. | cpk-ui's `genTheme()` drops any top-level group outside `bg/role/text/button` (note `12` §7.2), the accent is per-ledger while the theme is global, and tinting expense amounts by a yellow ledger colour is unreadable in light mode. |
| D5  | **`useTabletLayout()` (window minimum dimension >= 600dp) is the only structural breakpoint.** `useLayoutMetrics()` may derive widths/columns, but never a competing phone/tablet boolean.     | This is the binding `app/AGENTS.md` rule. It replaced `useCPK().media.isTablet` on 2026-09-09: cpk-ui's flag is a desktop-width media query and `Platform.isPad` ignores the window, so both misclassified 600dp Android portrait tablets and split-screen. Code never branches on the cumulative `isMobile`; one shared authority prevents route/component disagreement. |

---

# 1. The complete `app/` tree

```
app/
├── _layout.tsx                          Providers + AuthGate (Stack.Protected) + global overlays
├── +native-intent.tsx                   redirectSystemPath: /invite/:code, /@handle, /e/:itemId
├── +not-found.tsx                       replaces legacy NoPage
│
├── (auth)/                              guard: stage === 'signed-out'
│   ├── _layout.tsx                      Stack, headerShown:false, gestureEnabled:false
│   ├── index.tsx                        landing: logo, Kakao/Naver/Google/Apple/email, ToS+Privacy
│   ├── sign-in-code.tsx                 6-digit email OTP entry
│   └── legacy-help.tsx                  "예전 BooKoo 계정이 있어요" / Facebook-only recovery
│
├── (onboarding)/                        guard: stage === 'onboarding'
│   ├── _layout.tsx                      Stack.Protected per onboardingStep, animation:'fade'
│   ├── handle.tsx                       @handle claim (BLOCKING, no back)
│   ├── profile.tsx                      display name, avatar, language, default currency (skippable)
│   ├── legacy-claim.tsx                 "이 계정들이 본인 것인가요?" (only when ambiguous)
│   └── ledger.tsx                       create first ledger OR paste an invite code (skippable)
│
├── lock.tsx                             guard: stage === 'locked'. Biometric-first, 6-digit PIN
├── account/
│   ├── deleted.tsx                      guard: stage === 'pending-deletion'. Restore-within-30d
│   └── suspended.tsx                    restricted appeal/help + sign out; mounts no ledger queries
│
├── invite/                              REACHABLE SIGNED-OUT — declared outside (app)
│   ├── [code].tsx                       invite preview card → 참여하기
│   └── code.tsx                         manual code entry (grouped BK1-XXXX-… input)
│
├── u/
│   └── [handle].tsx                     public profile by handle (replaces legacy ProfileYours)
│
└── (app)/                               guard: stage === 'ready'
    ├── _layout.tsx                      Stack; declares every modal presentation
    │
    ├── (tabs)/
    │   ├── _layout.tsx                  Tabs (expo-router/js-tabs) on phone; rail on tablet
    │   ├── index.tsx                    CALENDAR   → _Tabs/TabCalendar/{Mobile,Tablet}
    │   ├── timeline.tsx                 TIMELINE   → _Tabs/TabTimeline/{Mobile,Tablet}
    │   ├── add.tsx                      "+" pseudo-tab — never renders (tabPress preventDefault)
    │   ├── stats.tsx                    STATS      → _Tabs/TabStats/{Mobile,Tablet}
    │   └── me.tsx                       ME         → _Tabs/TabMe/{Mobile,Tablet}
    │
    ├── _Tabs/                           underscore ⇒ NOT routes (Martie's rule, note 07 §1.1)
    │   ├── TabCalendar/{TabCalendarMobile,TabCalendarTablet,types}.tsx
    │   ├── TabTimeline/{TabTimelineMobile,TabTimelineTablet,types}.tsx
    │   ├── TabStats/{TabStatsMobile,TabStatsTablet,types}.tsx
    │   ├── TabMe/{TabMeMobile,TabMeTablet,types}.tsx
    │   └── components/
    │       ├── LedgerHeader.tsx         title+chevron (opens switcher), unseen dot, notif bell
    │       ├── MeHeader.tsx
    │       └── MonthPagerHeader.tsx     ← / "2026년 8월" / → , shared by Calendar+Stats
    │
    ├── entry/
    │   ├── new.tsx                      MODAL. add expense/income (segmented, not two tabs)
    │   └── [itemId]/
    │       ├── index.tsx                entry detail + comment thread
    │       ├── edit.tsx                 MODAL. same form component as new.tsx
    │       └── photos.tsx               all photos grid (replaces SeeAllPicture)
    │
    ├── photo/
    │   └── [itemId].tsx                 MODAL, fullScreenModal. pinch-zoom pager; ?index=&edit=
    │
    ├── place/
    │   └── view.tsx                     MODAL. migrated label/address + system Maps Linking
    │
    ├── ledgers/
    │   ├── index.tsx                    all ledgers, archived section, received invites
    │   └── new.tsx                      MODAL. create ledger (title, emoji, colour, currency)
    │
    ├── ledger/[ledgerId]/
    │   ├── _layout.tsx                  Stack; ledger title in header
    │   ├── settings.tsx                 title/desc/emoji/colour, policies, danger zone entry
    │   ├── members.tsx                  roster, swipe actions, role chips, ghost invite rows
    │   ├── invites.tsx                  active invite links: note/creator/uses/expiry/Revoke
    │   ├── requests.tsx                 승인 대기 (the legacy WAITING_LIST, promoted)
    │   ├── categories.tsx               reorder / hide / rename / add / archive
    │   ├── audit.tsx                    활동 기록 (ADMIN+, paginated)
    │   ├── photos.tsx                   ledger-wide photo gallery (NEW)
    │   ├── currency.tsx                 base-currency picker + confirm-assumed flow
    │   ├── timezone.tsx                 IANA tz + weekStartsOn + periodStartDay
    │   └── danger.tsx                   transfer ownership / archive / leave / delete
    │
    ├── stats/
    │   └── category/[categoryKey].tsx   12-month trend + month drill-down list
    │
    ├── search.tsx                       full-ledger search (memo / amount / category / type)
    ├── notifications.tsx                notification inbox
    │
    ├── profile/
    │   ├── edit.tsx                     MODAL. avatar, display name, bio, links
    │   └── handle.tsx                   MODAL. change @handle (cooldown-aware)
    │
    └── settings/
        ├── appearance.tsx               theme: system / light / dark
        ├── language.tsx                 en · ko · ja · zh · id
        ├── default-currency.tsx         profile default for NEW ledgers only
        ├── notifications.tsx            per-kind + per-ledger push switches
        ├── lock.tsx                     app lock: enable, PIN, biometrics, auto-lock delay
        ├── account.tsx                  linked providers, add email, sign out, delete account
        ├── privacy.tsx                  rights, personal export history/download, policy choices
        ├── announcements.tsx            공지 (Convex-backed accordion)
        ├── faq.tsx                      FAQ (Convex-backed accordion)
        ├── feedback.tsx                 의견 보내기 + my past feedback
        ├── ops.tsx                      ADMIN-only content/config/feedback operations
        └── about.tsx                    version, licenses, ToS, privacy
```

**Route count:** 61 route files. Legacy had 30 flat routes with zero grouping and zero deep links.

### 1.1 `app/_layout.tsx` — complete provider order

Module scope, before any render:

```ts
SplashScreen.preventAutoHideAsync();
setFontFamily({heading: {...}, body: {...}});          // cpk-ui export

const appModuleStartedAt = Date.now();

const secureStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,                        // REQUIRED on RN (note 13 §7.1)
});

// Synchronous MMKV reads — available before the first frame (note 13 §7.4)
const themePref   = storage.getString(Storage.ThemeType) as ThemePref | undefined; // 'system'|'light'|'dark'
const lockEnabled = storage.getBoolean(Storage.LockEnabled) ?? false;
const sessionHint = readSessionHint();                 // auth-onboarding.md §13.3 layer 3
```

`boot-and-providers.md` is the one normative tree. In compact form it is:

```text
GestureHandlerRootView → Root/CpkProvider → RootErrorBoundary → Keyboard → ActionSheet
→ ConvexAuthProvider → SessionCacheBoundary → ConvexQueryCacheProvider → LocaleProvider
→ AccessibilityPreferencesProvider → ConnectivityProvider → LegacySensitiveStorageCleanup + BootGate
→ AppLockProvider → AuthGate → ready: LedgerAccentProvider → NotificationProvider → AppNavigator
```

The in-memory query cache is inside auth and remounted before sign-out/account switch. Legacy encrypted
storage cleanup is a non-blocking side effect; BootGate is before private routes; accent/push providers
mount only in the authenticated `ready` branch. Cpk owns the only SafeAreaProvider.

**Global overlays** are siblings of `<Stack>`, mounted once, driven by zustand `visible` flags — never
routes (Martie's pattern, note `07` §1.5):

```tsx
<Container>
  <Content>
    <AuthGate />
  </Content>
  <LedgerSwitcherSheet />{' '}
  {/* @gorhom/bottom-sheet, opened from any ledger header */}
  <PrivacyCover /> {/* AppState==='inactive' → opaque cover (auth §14.2) */}
  <SoftUpdateSheet />{' '}
  {/* only after BootGate normal; seven-day exact-version cadence */}
  <Snackbars />
</Container>
```

Maintenance and hard native update are mutually exclusive `BootGate` screens, not modals over private
content. OTA download/reload uses the same gate and never reloads over a dirty form or upload.

`LedgerSwitcherSheet` is an overlay rather than a route on purpose: it must open over any tab without
pushing a screen, and it must not be reachable by URL.

### 1.2 The gate — `AuthGate`

Verbatim shape from `auth-onboarding.md` §9.3, with the invite group added:

```tsx
function AuthGate(): React.ReactElement | null {
  const {stage, onboardingStep} = useSession();
  const {ready: fontsReady} = useAppFonts();

  useEffect(() => {
    if (stage !== 'loading' && fontsReady) void SplashScreen.hideAsync();
  }, [stage, fontsReady]);

  if (stage === 'loading' || !fontsReady) {
    // Layer 3 of the anti-flicker fix: a returning user sees their shell, not a logo.
    return sessionHint?.hadSession ? <AppShellSkeleton /> : null;
  }

  return (
    <Stack screenOptions={rootScreenOptions}>
      {/* Most restrictive first: when a guard flips false expo-router falls back to the first
          still-mounted screen. */}
      <Stack.Protected guard={stage === 'signed-out'}>
        <Stack.Screen name="(auth)" options={{headerShown: false}} />
      </Stack.Protected>

      <Stack.Protected guard={stage === 'suspended'}>
        <Stack.Screen
          name="account/suspended"
          options={{headerShown: false, gestureEnabled: false}}
        />
      </Stack.Protected>

      <Stack.Protected guard={stage === 'pending-deletion'}>
        <Stack.Screen
          name="account/deleted"
          options={{headerShown: false, gestureEnabled: false}}
        />
      </Stack.Protected>

      <Stack.Protected guard={stage === 'onboarding'}>
        <Stack.Screen
          name="(onboarding)"
          options={{headerShown: false, gestureEnabled: false}}
        />
      </Stack.Protected>

      <Stack.Protected guard={stage === 'locked'}>
        <Stack.Screen
          name="lock"
          options={{headerShown: false, gestureEnabled: false}}
        />
      </Stack.Protected>

      <Stack.Protected guard={stage === 'ready'}>
        <Stack.Screen name="(app)" options={{headerShown: false}} />
      </Stack.Protected>

      {/* Deliberately UNGUARDED: an invite link must render its preview signed-out. */}
      <Stack.Screen name="invite/[code]" options={{presentation: 'card'}} />
      <Stack.Screen name="invite/code" options={{presentation: 'modal'}} />
      <Stack.Screen name="u/[handle]" options={{presentation: 'card'}} />
    </Stack>
  );
}
```

`stage` comes from `src/features/auth/useSession.ts` and is computed exactly as
`auth-onboarding.md` §13.3 layer 1 specifies — `'profile-missing'` is a distinct stage, never folded
into `'loading'`.

**Server-side is the real gate.** Every non-onboarding Convex function calls `requireOnboarded(ctx)`;
every ledger-scoped one calls `requireLedgerRole(...)`. The `Stack.Protected` tree is UX, not
security.

### 1.3 Modal declarations — `app/(app)/_layout.tsx`

Presentation is declared at layout level, never inside the screen file (Martie, note `07` §1.4):

```tsx
<Stack screenOptions={rootScreenOptions}>
  <Stack.Screen name="(tabs)" options={{headerShown: false}} />
  <Stack.Screen
    name="ledger/[ledgerId]/item/new"
    options={{presentation: 'card', headerShown: false}}
  />
  <Stack.Screen
    name="ledger/[ledgerId]/item/[itemId]/edit"
    options={{presentation: 'card', headerShown: false}}
  />
  <Stack.Screen
    name="entry/category/index"
    options={{presentation: 'formSheet', headerShown: false}}
  />
  <Stack.Screen
    name="photo/[itemId]"
    options={{
      presentation: 'fullScreenModal',
      headerShown: false,
      animation: 'fade',
    }}
  />
  <Stack.Screen name="place/view" options={{presentation: 'modal'}} />
  <Stack.Screen name="ledgers/new" options={{presentation: 'modal'}} />
  <Stack.Screen name="profile/me" options={{presentation: 'card'}} />
  <Stack.Screen name="profile/edit" options={{presentation: 'modal'}} />
  <Stack.Screen name="profile/handle" options={{presentation: 'modal'}} />
</Stack>
```

`rootScreenOptions` is theme-driven (Martie §1.4): `headerStyle.backgroundColor = theme.bg.basic`,
`contentStyle.backgroundColor = theme.bg.basic`, `headerShadowVisible: false`,
`headerTintColor = theme.text.label`, and a custom `headerLeft` with a 48px-radius `RectButton`
falling back to `replace('/')` when `!canGoBack`.

### 1.4 Deep links — `app/+native-intent.tsx`

```ts
const DEEP_LINK_HOST = 'bookoo.hyo.dev';

const INVITE_PATH = /^\/invite\/([0-9A-Za-z-]{20,40})$/;
const HANDLE_PATH = /^\/@([a-z0-9_.]{2,30})$/;
const ENTRY_PATH = /^\/e\/([a-z0-9]{20,40})$/;

export function redirectSystemPath({path}: RedirectSystemPathParams): string {
  try {
    const url = new URL(path, `https://${DEEP_LINK_HOST}`);
    if (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.hostname !== DEEP_LINK_HOST
    ) {
      return path;
    }
    const {pathname} = url;

    const invite = pathname.match(INVITE_PATH);
    if (invite?.[1]) {
      const code = normalizeInviteCode(invite[1]); // shared/inviteCode.ts
      if (code) return `/invite/${code}`;
    }
    const handle = pathname.match(HANDLE_PATH);
    if (handle?.[1]) return `/u/${handle[1]}`;

    const entry = pathname.match(ENTRY_PATH);
    if (entry?.[1]) return `/entry/${entry[1]}`;
  } catch {
    /* fall through */
  }
  return path;
}
```

`app.config.ts` (from `sharing-invites.md` §2.4): `scheme: 'bookoo'` (Naver gets its own
`'bookoonaver'` — the naver-login plugin swallows every URL on its scheme before expo-router sees it),
`ios.associatedDomains: ['applinks:bookoo.hyo.dev']`, and one Android `intentFilters` entry with
`autoVerify: true` and `pathPrefix: '/invite'`. `/@` and `/e` remain internal/custom-scheme routes until
their own verified-link entries are deliberately added to the shipped scaffold.

**Custody of a pending invite** (`src/features/invite/pendingInvite.ts`): the code goes to
**SecureStore**, not MMKV, with a 24-hour TTL, because Kakao/Naver/Apple take the user out of the app
and Android can cold-restart mid-OAuth. A single root-level effect in `app/_layout.tsx` fires
`if (currentUser?.handle && pending) router.push(\`/invite/${pending.code}\`)` — after sign-in _and_
after handle claim, never before.

**Notification taps** resolve through the same file. `notifications` rows carry
`{kind, ledgerId?, itemId?}`; `src/features/push/routeForNotification.ts` maps a kind to a path
(`COMMENT_ADDED` → `/entry/{itemId}`, `JOIN_REQUESTED` → `/ledger/{ledgerId}/requests`,
`MEMBER_JOINED` → `/ledger/{ledgerId}/members`). Tapping also sets `activeLedgerId` first, so the
tabs behind the pushed screen show the right ledger. The root observes both
`getLastNotificationResponseAsync()` and `addNotificationResponseReceivedListener`, clears a consumed
response, and never trusts an arbitrary payload URL. The exhaustive route table is
`notifications-push.md` §6.

### 1.5 Every legacy screen → its new home

| #    | Legacy route                       | Verdict                              | New route / component                                                                                                                                                                                                                                                                                                                                               |
| ---- | ---------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1  | `Tutorial` (3-slide swiper)        | **Merged**                           | Folded into `(auth)/index.tsx` as a non-blocking 3-page `react-native-pager-view` hero above the always-reachable provider buttons. No flag and no route; `legacy-feature-contracts.md` §6 owns accessibility and the D4 legal seam.                                                                                                                                |
| 5.2  | `Intro` (auth landing)             | **Kept**                             | `app/(auth)/index.tsx`. Facebook dropped (DECISIONS §3); Kakao/Naver/Google/Apple/email-OTP added; the hardcoded `'--- or login with ---'` divider becomes `t('auth.orContinueWith')`.                                                                                                                                                                              |
| 5.3  | `Login` (email+pw)                 | **Redesigned**                       | `app/(auth)/index.tsx` email field → `app/(auth)/sign-in-code.tsx`. Password auth is gone. Per-field validity checkmarks and disabled-until-valid submit are preserved on the email field.                                                                                                                                                                          |
| 5.4  | `Signup`                           | **Dropped (merged)**                 | There is no separate signup: OTP/social sign-in creates the account, and `(onboarding)/handle` + `(onboarding)/profile` collect what `Signup` collected. The invite-drain-on-first-signup capability survives as `invites.queries.myPendingInvites` on `(onboarding)/ledger`.                                                                                       |
| 5.5  | `FindPw`                           | **Dropped**                          | No passwords exist. Recovery is "sign in with the same email".                                                                                                                                                                                                                                                                                                      |
| 5.6  | `Lock`                             | **Kept, redesigned**                 | `app/lock.tsx`. 6 digits not 4, one hidden `TextInput` behind six presentational boxes, biometric-first with PIN fallback, `gestureEnabled: false`, no `goBack()` (the legacy called `goBack()` from the root route).                                                                                                                                               |
| 5.7  | `Main` (SideMenu + 4 tabs)         | **Split**                            | Shell → `app/(app)/(tabs)/_layout.tsx`. Drawer ledger list → `LedgerSwitcherSheet` + `app/(app)/ledgers/index.tsx`. Drawer account block → `me` tab. Drawer gear → `me` tab. Navbar "+" → the centre `add` pseudo-tab. Owner crown, pending-request dot, unverified-email dot, remembered ledger, empty state: all preserved (§2.3).                                |
| 5.8  | `Tab1` Monthly                     | **Kept**                             | `app/(app)/(tabs)/index.tsx` → `TabCalendar*`. Parallax header → Reanimated collapsing header; vendored `Calendar` → cpk-ui `<Calendar>` via `<LedgerCalendar>`; O(n²) `checkEventDates` → `api.rollups.queries.daysInRange`.                                                                                                                                       |
| 5.9  | `Tab2` Lists                       | **Kept**                             | `app/(app)/(tabs)/timeline.tsx` → `TabTimeline*`. `deprecated-react-native-listview` → FlashList; in-memory `.includes()` filter → `app/(app)/search.tsx` on `ledgerItems.search_memo`; sticky day headers with per-day income/expense subtotals preserved, now exact across page boundaries (§7.2).                                                                |
| 5.10 | `Tab3` Graph                       | **Kept**                             | `app/(app)/(tabs)/stats.tsx` → `TabStats*`. Client-side aggregation → `api.rollups.queries.categoriesOfMonth` + `balanceBefore` + `month`. Android month-swipe now works (the legacy set `scrollEnabled={Platform.OS === 'ios'}`).                                                                                                                                  |
| 5.11 | `Tab4` Extra                       | **Dropped (merged)**                 | Its two rows are `settings/language.tsx` and `ledger/[ledgerId]/currency.tsx`. It was a two-row screen occupying 25% of the tab bar, and its zh/id labels literally translated to "guitar". The `reload()` forced-remount hack dies with it (`useLocale()` is reactive).                                                                                            |
| 5.12 | `LedgerAdd`                        | **Kept**                             | `app/(app)/ledgers/new.tsx` (modal). Colour swatches become `AccentSet` previews that work in dark mode; adds emoji and base currency.                                                                                                                                                                                                                              |
| 5.13 | `LedgerSearch`                     | **DROPPED**                          | `sharing-invites.md` §3.2: legacy `searchLedgers` exposed every household ledger to every signed-in stranger by exact title. There is no `search_title` index and no `discoverable` field in `SCHEMA.md` §3.5. Replaced by the invite link (`invite/[code]`) and manual code entry (`invite/code`). The _approval_ UX survives as `ledger/[ledgerId]/requests.tsx`. |
| 5.14 | `LedgerDetail` (member, read-only) | **Merged**                           | `app/(app)/ledger/[ledgerId]/settings.tsx`. One screen; fields are `editable={hasLedgerRole(role,'ADMIN')}`. Two near-identical 600–750-line screens differing only by permission was the legacy's largest duplication.                                                                                                                                             |
| 5.15 | `LedgerUpdate` (owner)             | **Merged**                           | Same screen. Email-blast invite (`inviteUsers` read the entire `bookoo/users` node client-side) → `invites.mutations.create` + the native share sheet.                                                                                                                                                                                                              |
| 5.16 | `SeeMembers`                       | **Kept, split**                      | `ledger/[ledgerId]/members.tsx` (roster + swipe actions) and `ledger/[ledgerId]/requests.tsx` (the `WAITING_LIST` block, promoted to its own route with a badge). Swipe-to-transfer-ownership and swipe-to-remove preserved via `ReanimatedSwipeable`.                                                                                                              |
| 5.17 | `LedgerItemAddOrUpdate` (1153 L)   | **Kept, collapsed**                  | New and edit routes render one editor. Income precedes Expense under one moving Reanimated underline; category selection uses the shared searchable icon sheet and server-owned ledger categories. |
| 5.18 | `LedgerItemDetail`                 | **Kept**                             | `entry/[itemId]/index.tsx` uses paginated comments, shows signed expense amounts, concise empty comments, and up to five photo previews that open the native pager directly. |
| 5.19 | `LedgerLineGraph`                  | **Kept**                             | `stats/category/[categoryKey].tsx`. Hand-drawn `react-native-svg` polyline → `victory-native@41` over its installed Skia renderer; per-month JS aggregation → `api.rollups.queries.categoryTrend`.                                                                                                                                                                  |
| 5.20 | `LedgerSettingCurrency`            | **Kept, re-scoped**                  | `ledger/[ledgerId]/currency.tsx`. Currency is now **per-ledger** (`ledgers.baseCurrency`), not a device AsyncStorage setting — the legacy model let three members of one ledger enter three currencies with no record. The 46-row hardcoded table (with EUR's unit as `$` and ZAR's as `VND`) is not ported; the list comes from `money-categories-i18n.md` §1.2.   |
| 5.21 | `LedgerSettingLanguage`            | **Kept**                             | `settings/language.tsx` ships `en/ko/ja/zh/id/de/es/fr/it/nl/pt`; selection is a radio list and locale notification is deferred until after navigation. |
| 5.22 | `Setting`                          | **Kept, expanded**                   | The `me` tab is the settings root; rows link into `settings/*`. Routing-by-translated-label (`switch (type) { case getString('SETTING_ANNOUNCEMENT') … }`) → a typed enum. New rows: appearance, account deletion (App Store 5.1.1(v)), data export, linked accounts. The lock toggle no longer disables the lock without authentication.                           |
| 5.23 | `SettingAnnouncement`              | **Kept, paginated**                  | `settings/announcements.tsx` uses `api.content.queries.list` with Convex cursor pagination and opens one concise detail route. |
| 5.24 | `SettingFAQ`                       | **Kept, paginated**                  | `settings/faq.tsx` uses the same indexed paginated content query and expands answers in place; no fake new badge. |
| 5.25 | `SettingNoti`                      | **Kept, expanded**                   | `settings/notifications.tsx`. One AsyncStorage switch → per-kind and per-ledger server-side preferences. The `getPushToken`-returns-`undefined`-when-already-granted bug is not reproduced.                                                                                                                                                                         |
| 5.26 | `SettingOpinion`                   | **Dropped (merged)**                 | The current app removes `settings/feedback.tsx`; `settings/legal/support.tsx` owns one Customer inquiry email action. Legacy Feedback endpoints remain compatibility-only. |
| 5.27 | `SettingLock`                      | **Kept, redesigned**                 | `settings/lock.tsx`. Plaintext `LOCKED_NUMBER` in AsyncStorage → a scrypt verifier in SecureStore; adds auto-lock delay, lock-on-background, and an attempt policy.                                                                                                                                                                                                 |
| 5.28 | `ProfileMine`                      | **Kept, split**                      | `profile/me.tsx` is the signed-in self-management summary; `profile/edit.tsx` (modal) owns editable fields. The drawer and account surfaces navigate to `/profile/me`, never the public-user route. Avatar storage keyed by **email** (`users/{email}`) → Convex storage keyed by user id. `tel` is **dropped** (see 5.29).                                         |
| 5.29 | `ProfileYours`                     | **Kept, narrowed**                   | `u/[handle].tsx`. The legacy showed another member's **email and phone number** to anyone in a shared ledger. The new public profile shows handle, display name, avatar, bio, join date — no email, no phone.                                                                                                                                                       |
| 5.30 | `SeeAllPicture`                    | **Dropped (merged)**                 | The intermediate photo gallery route is removed. Entry edit opens the system picker directly, caps selection at five, and detail/editor previews open `/photo/[itemId]`. |
| 5.31 | `PictureSwipePage`                 | **Kept**                             | `photo/[itemId].tsx?index=&edit=`. cpk-ui `PinchZoom` per SDK-pinned native pager page; explicit cache download → write-only permission → `MediaLibrary.Asset.create`; edit-authorized detach. No second gallery/zoom dependency.                                                                                                                                   |
| 5.32 | `GoogleMap`                        | **Kept, consent-gated**              | Entry location uses `expo-location` plus `expo-maps`: current coordinates, geocode search, tap-to-place pin, reverse-geocoded address, and stored coordinates. iOS uses Apple Maps; Android uses Google Maps and requires a package/signature-restricted native key. Native-device verification is required; a keyless fallback is not a map pass. |
| 5.33 | `NoPage`                           | **Replaced**                         | `app/+not-found.tsx`.                                                                                                                                                                                                                                                                                                                                               |
| 5.34 | `Test`                             | **Deleted**                          | Dev scratchpad rendering an empty `<View>`.                                                                                                                                                                                                                                                                                                                         |

**Screens with no legacy ancestor** (new, and why): `invite/[code]` + `invite/code` (the whole invite
model), `(onboarding)/*` (handle + legacy claim), `account/deleted` (App Store deletion grace),
`notifications` (there was no inbox — pushes vanished), `search` (was an in-memory filter),
`ledger/[id]/audit` (누가 뭘 바꿨나 in a shared ledger), `ledger/[id]/categories` (categories were
device-local SQLite), `ledger/[id]/timezone` (`SCHEMA.md` §7.2 makes tz the authority for `dayKey`),
`ledger/[id]/photos` (a ledger-wide receipt gallery), `settings/appearance` (dark mode),
`settings/account` (linked providers, deletion), `u/[handle]` (public profile),
`stats/category/[key]` is the renamed `LedgerLineGraph`, `settings/default-currency` makes the
profile/ledger currency split explicit, and `settings/ops` is the authenticated ADMIN operations path.

---

# 2. The tab structure

## 2.1 The decision

Legacy: `SideMenu` drawer (ledger switcher + profile + settings + add-ledger) wrapping a
`react-native-tab-navigator` with 4 tabs — Monthly / Lists / Graph / Extra — and a "+" button inside
the navbar of each tab.

New: **five tab slots, no drawer.**

| slot | route             | label key       | icon                            | scope         |
| ---- | ----------------- | --------------- | ------------------------------- | ------------- |
| 1    | `(tabs)/index`    | `tabs.calendar` | calendar                        | active ledger |
| 2    | `(tabs)/timeline` | `tabs.timeline` | list                            | active ledger |
| 3    | `(tabs)/add`      | — (no label)    | ⊕ filled circle, `role.primary` | active ledger |
| 4    | `(tabs)/stats`    | `tabs.stats`    | chart-donut                     | active ledger |
| 5    | `(tabs)/me`       | `tabs.me`       | avatar / person                 | account       |

## 2.2 Why a drawer is no longer right

Argued against the legacy flows in note `01` §5.7:

1. **The drawer's contents were three unrelated things.** Ledger rows (high frequency), the account
   block and gear (low frequency), and `+ ADD_LEDGER` (once a year). Bundling them forced a hidden
   surface to be the home of the most-used control in the app.
2. **The drawer was the ledger switcher and nothing else could be.** Legacy `selectLedger(index)`
   closed the drawer, then `setTimeout(…, 330)` before dispatching so the animation could finish —
   a 330 ms delay on the app's most common action. A bottom sheet has no such coupling.
3. **A drawer is invisible.** There is no affordance for "this app has more than one ledger" until you
   swipe. The header title with a chevron (`우리집 가계부 ⌄`) states it.
4. **The drawer duplicated navigation.** `MORE` on a ledger row routed to `LedgerUpdate` **or**
   `LedgerDetail` depending on ownership, and passed four callbacks through navigation params
   (`handleSetMembers`, `handleSetOwner`, `handleLedgerUpdate`, `handleExitLedger`) two levels deep.
   All of that plumbing exists only because the drawer owned the ledger array. With Convex reactive
   queries the array has no owner and the callbacks are deleted.
5. **The Android back-button hack.** `src/utils/Data.ts` exported a mutable module-level `routes: []`
   that every screen pushed/popped just so `Main`'s `BackHandler` could decide between "close the
   drawer", "go to tab1" and "let the OS handle it". Removing the drawer removes one of the three
   branches; expo-router handles the rest.
6. **Tablet.** A drawer on a 1024 pt screen is wasted motion — the rail is always visible (§4.2).

## 2.3 Where ledger switching lives

Three surfaces, one source of truth:

**a) `LedgerSwitcherSheet`** — a `@gorhom/bottom-sheet` mounted once at root, opened by tapping the
header title on Calendar / Timeline / Stats. Rows come from `api.ledgers.queries.listMine` (≤20
ledgers, 60 documents, **0 re-runs per item write** — `SCHEMA.md` §4 row 1). Each row: accent dot,
emoji, title, member count, owner crown, and two badges from _separate_ subscriptions so the switcher
never re-renders because somebody typed an expense:

- unseen-activity dot ← `api.ledgers.queries.unseen` (at most 8 pinned/recent targets, 25 docs,
  1 re-run/write for a targeted ledger)
- pending-request dot ← `api.ledgers.queries.pendingRequestCounts` (≤20 docs, 0 re-runs)

Footer: `+ 새 가계부` → `/ledgers/new`, `코드로 참여` → `/invite/code`, `전체 보기` → `/ledgers`.

**b) `app/(app)/ledgers/index.tsx`** — the management screen: all ledgers, an archived section,
received invites (`api.invites.queries.myPendingInvites`), and my outstanding join requests
(`api.joinRequests.queries.mine`). This is the legacy drawer's "more" surface, promoted.

**c) The store.** `useLedgerStore` (zustand + MMKV write-through):

```ts
interface LedgerState {
  activeLedgerId: Id<'ledgers'> | null;
  setActiveLedger: (id: Id<'ledgers'>) => void;
}
```

Legacy persisted `selectedLedgerIndex` — an **index**, which silently pointed at a different ledger
whenever the list reordered or one was deleted. We persist the id and validate it on boot against
`listMine`; an id that is no longer a membership falls back to the most recently active remaining
ledger, then to `null` (which routes to the empty state).

**Legacy behaviours preserved:** the crown overlay on owned ledgers, the blue dot for pending join
requests (owner-only), the red dot on the account row when the email is unverified (now on the `me`
tab icon), the remembered ledger across launches, and the empty state (`icNoLedger`, `NO_LEDGER_TXT`,
an outlined `ADD_LEDGER` pill) — which in the legacy also suppressed the tab bar. We keep that: with
`activeLedgerId === null` the three ledger-scoped tabs render `<NoLedgerEmptyState/>` instead of
their content, and `add` is disabled.

## 2.4 The `add` pseudo-tab

```tsx
<Tabs.Screen
  name="add"
  options={{
    tabBarShowLabel: false,
    tabBarIcon: ({focused}) => <AddTabIcon focused={focused} />, // filled circle, role.primary
  }}
  listeners={{
    tabPress: (e) => {
      e.preventDefault(); // never navigates to the route
      if (!activeLedgerId) {
        openLedgerSwitcher();
        return;
      }
      router.push('/entry/new');
    },
  }}
/>
```

`app/(app)/(tabs)/add.tsx` exports `<Redirect href="/(app)/(tabs)" />` as a defensive no-op — it is
never reached, but a tab route file must exist. The `preventDefault` idiom is exactly what Martie uses
to gate its `my` tab (note `07` §2.6).

Why a centre tab rather than a FAB: the legacy "+" lived in the navbar of every tab, i.e. it was
already a global action; a FAB floating over a FlashList costs a bottom inset on every list and
collides with the day-section subtotals. A centre tab is the dominant Korean 가계부 pattern and needs
no inset.

## 2.5 `app/(app)/(tabs)/_layout.tsx`

```tsx
import {Tabs} from 'expo-router/js-tabs'; // NOT 'expo-router' — Martie note 07 §2.6

export default function TabsLayout(): ReactElement {
  const {theme} = useCPK();
  const isTablet = useTabletLayout();
  const accent = useLedgerAccent();

  if (isTablet) return <TabletRail />; // §4.2 — same routes, different chrome

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false, // every tab draws its own header
        tabBarActiveTintColor: theme.role.primary,
        tabBarInactiveTintColor: theme.text.placeholder,
        tabBarStyle: [
          css`
            background-color: ${theme.bg.basic};
            border-top-color: ${theme.role.border};
          `,
        ],
      }}
    >
      …
    </Tabs>
  );
}
```

Note the legacy tab bar hand-computed its height (`80/paddingBottom 16` when
`Constants.statusBarHeight > 24`, else `56`). We do not: `expo-router`'s `Tabs` + `SafeAreaProvider`
handle the inset, and `useSafeAreaInsets()` supplies the list `contentContainerStyle.paddingBottom`.

**Only the four tab-route files may live under `(tabs)/`** — anything else placed there becomes a
tab (Martie's documented rule, note `07` §1.1). Everything a tab needs lives under `app/(app)/_Tabs/`.

---

# 3. Screen-by-screen: purpose, queries, states, pagination

Query names are `SCHEMA.md` §4 expanded to `api.<domain>.queries.<name>`. "Docs" is the document
count from §4. Every ledger-scoped query is gated by `requireLedgerMember` (`ledgerMembers.by_ledgerId_userId`,
`.unique()`, **1 document, O(1)**).

## 3.0 Boot (mounted by `_layout.tsx`, alive for the session)

| Query                                   | Index                                                      | Bound       | Docs | Purpose                                                                             |
| --------------------------------------- | ---------------------------------------------------------- | ----------- | ---- | ----------------------------------------------------------------------------------- |
| `api.users.queries.me`                  | `userProfiles.by_userId`                                   | `.unique()` | 1    | drives `SessionStage`                                                               |
| `api.app.queries.config`                | `appConfig.by_singleton`                                   | `.unique()` | 1    | force-update, maintenance, feature flags. One cache entry for the entire user base. |
| `api.notifications.queries.unreadCount` | `notifications.by_userId_deletedAt_readAt`                 | `.take(50)` | ≤50  | tab badge; renders "50+"                                                            |
| `api.ledgers.queries.listMine`          | `ledgerMembers.by_userId_deletedAt` `.take(50)` + `db.get` | ≤20         | 40   | switcher + accent resolution                                                        |

**Cold start reads 61 documents to the first live shell** (`me` + `listMine`). D6 may paint their
encrypted mirrors after the device-only key unlocks and before the socket; the native first frame uses
only non-sensitive synchronous hints.

## 3.1 Calendar tab — `(tabs)/index.tsx`

**Purpose.** The legacy Tab1: a month grid with per-day markers, and the selected day's entries below.

**Queries** (6 live subscriptions — `SCHEMA.md` §4.1 budget):

| Query                             | Args                                 | Docs          | Notes                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------- | ------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.rollups.queries.daysInRange` | `{ledgerId, fromDayKey, toDayKey}`   | ≤126 returned | **the grid markers.** Range = the mounted pager window built with `ledger.weekStartsOn`: first cell of the previous month's grid → last cell of the next month's. One subscription serves three pages. The server validates the ≤126-day range, applies `DAY_ROLLUP_SCAN_LIMIT`, and sums every shard before returning one total per day. |
| `api.rollups.queries.month`       | `{ledgerId, monthKey}`               | 1             | header tile: month income / expense / net                                                                                                                                                                                                                                                                                                 |
| `api.items.queries.listByDay`     | `{ledgerId, dayKey, paginationOpts}` | ≤30/page      | the day list                                                                                                                                                                                                                                                                                                                              |
| `api.ledgers.queries.roster`      | `{ledgerId}`                         | target ≤32    | member/profile + two-direction block sidecar, shared across pages; hard cap remains bounded                                                                                                                                                                                                                                               |
| `api.categories.queries.list`     | `{ledgerId}`                         | 0 or ≤120     | sidecar — category label + icon for every row                                                                                                                                                                                                                                                                                             |
| `api.ledgers.queries.unseen`      | `{}`                                 | 21            | header dot                                                                                                                                                                                                                                                                                                                                |

> **R3 consolidation decision.** Ship only `daysInRange({ledgerId, fromDayKey, toDayKey})`; the former
> `daysOfMonth` and `dayMarkers` names are removed from the normative design. Calendar needs the bounded
> three-grid-page window and Timeline already uses the same exact indexed range. One function means one
> shard-summing implementation and one cache-key space.

**Pagination.** The day list is a `usePaginatedQuery` at `ITEM_PAGE_SIZE = 30`. In practice a single
day never exhausts one page; the pagination exists so that a shared ledger where eight members enter
twenty items each still renders in constant time.

**States.**

| state                                    | render                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| first paint, cold                        | grid skeleton (7×6 pulsing cells at the exact final cell size) + 3 `EntryRowSkeleton`s     |
| `daysInRange === undefined` after 3 s    | grid renders with no markers and a connection-required state; no stale private data paints |
| day list `status === 'LoadingFirstPage'` | 3 `EntryRowSkeleton`s; `ListEmptyComponent` suppressed                                     |
| day list empty                           | `t('calendar.noEntriesOnDay')` + a "이 날에 추가" button that opens `/entry/new?dayKey=`   |
| ledger has zero entries ever             | `<NoEntriesEmptyState/>` with the add CTA, and the calendar still renders                  |
| error                                    | `ErrorBoundary` → `FallbackComponent` with 다시 시도                                       |

**Selection state** lives in `useCalendarStore` (`{monthKey: 'yyyy-MM', selectedDayKey: 'yyyy-MM-dd'}`),
not in the URL and not in Convex. It is reset to today whenever `activeLedgerId` changes.
Here “today” means `dayKeyToCalendarKey(toDayKey(Date.now(), ledger.timeZone))`, maintained by
`useLedgerTodayKey(ledger.timeZone)` across ledger midnight and app resume. The wrapper passes
`weekStart={ledger.weekStartsOn}`. It converts `selectedDayKey` with `calendarKeyToDayKey` only when
calling `listByDay`; device timezone never changes the store keys or query arguments.

## 3.2 Timeline tab — `(tabs)/timeline.tsx`

**Purpose.** The legacy Tab2: an infinite, day-sectioned list with per-day income/expense subtotals.

**Queries** (7 subscriptions at one page, 21 at the 8-page ceiling):

| Query                                                        | Args                                                                                    | Docs       | Notes                                                                                                                                                                                                       |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.items.queries.list`                                     | `{ledgerId, type?, paginationOpts}`                                                     | 30/page    | index `by_ledgerId_deletedAt_dayKey_occurredAt` desc. The optional `type` filter uses `by_ledgerId_deletedAt_type_dayKey_occurredAt` — a real index, so no JS post-filter and therefore **no short pages**. |
| `api.rollups.queries.daysInRange`                            | `{ledgerId, fromDayKey, toDayKey}` — one per loaded page, bounds derived from that page | ≤30/page   | the section subtotals                                                                                                                                                                                       |
| `api.rollups.queries.month`                                  | `{ledgerId, monthKey}`                                                                  | 1          | header                                                                                                                                                                                                      |
| `api.ledgers.queries.roster` / `api.categories.queries.list` |                                                                                         | ≤16 / ≤120 | sidecars                                                                                                                                                                                                    |

**The section-header contract** (`SCHEMA.md` §4.4 — this is the subtle one):

```ts
const items = usePaginatedQuery(
  api.items.queries.list,
  {ledgerId},
  {initialNumItems: ITEM_PAGE_SIZE},
);

const fromDayKey = items.results.at(-1)?.dayKey; // oldest on screen
const toDayKey = items.results.at(0)?.dayKey; // newest on screen
const days = useQuery(
  api.rollups.queries.daysInRange,
  fromDayKey === undefined ? 'skip' : {ledgerId, fromDayKey, toDayKey},
);
```

A page is a set of **index-consecutive** items, so every `dayKey` between the page's first and last
item is a day represented on that page — at most 30 distinct days. The range read returns **every
shard** of each of those days, so a day split across two pages renders its **true** total in both.
Grouping the loaded page in JS would be silently wrong at exactly that boundary, and a second
paginated stream over `ledgerDayRollups` would be silently wrong the moment `ROLLUP_SHARD_COUNT > 1`.

**Pagination ceiling** (`SCHEMA.md` §4.6, `MAX_LIVE_ITEM_PAGES = 8` = 30 + 7×50 = 380 items):
`usePaginatedQuery` cannot unload off-screen pages, so unbounded `loadMore` is a subscription leak.
On the `loadMore` that would exceed 8 pages the list stops and renders a **month jump control** fed by
the ≤120 `ledgerMonthRollups` rows the stats screen already loads. Choosing a month re-issues
`api.items.queries.list` with `{ledgerId, fromDayKey, toDayKey}` — changing a non-`paginationOpts`
argument resets the whole pagination in one step, dropping all 8 old subscriptions.
Changing the month resets the paginated subscription and deliberately shows the correctly sized
`TimelineSkeleton` until the bounded replacement window arrives. The memory-only
`ConvexQueryCacheProvider` keeps recently unmounted *identical* query arguments warm for five minutes,
but it does not mirror private rows, retain stale rows for different arguments, or pretend that a new
month has already loaded.

**`pageStatus` render contract** (`SCHEMA.md` §4.7): during `SplitRecommended` / `SplitRequired` the
list renders the rows it has plus a **one-row skeleton strip** at the bottom of page 0. It never
blanks, never shows a full-screen spinner, and never treats a short page as `isDone` — `isDone` is the
only end-of-list signal. At 8 members × 20 entries/day, page 0 splits roughly five times a day, so
this is the normal case, not an edge case.

**States.** LoadingFirstPage → `<TimelineSkeleton/>` (6 rows + 2 headers at exact final heights);
`CanLoadMore` → the only state where `onEndReached` calls `loadMore(ITEM_PAGE_MORE = 50)`;
`LoadingMore` → footer `ActivityIndicator`; `Exhausted` → footer becomes a fixed 20 px spacer plus
"가계부의 시작이에요" when `results.length > 0`. Empty ledger → the shared `<NoEntriesEmptyState/>`.

## 3.3 Stats tab — `(tabs)/stats.tsx`

**Purpose.** The legacy Tab3: a donut of category shares with the running balance in the centre, an
expense/income toggle, a month pager, and a category breakdown list. `legacy-feature-contracts.md` §4
owns the top-seven-plus-Other rule, Victory/Skia decision, Reduce Motion, and semantic list fallback.

**Queries** (6 subscriptions):

| Query                                   | Args                   | Docs                  | Notes                                         |
| --------------------------------------- | ---------------------- | --------------------- | --------------------------------------------- |
| `api.rollups.queries.categoriesOfMonth` | `{ledgerId, monthKey}` | ≤40 typical, ≤120 cap | the donut series                              |
| `api.rollups.queries.month`             | `{ledgerId, monthKey}` | 1                     | month total + the **hot half** of the balance |
| `api.rollups.queries.balanceBefore`     | `{ledgerId, monthKey}` | ≤120                  | the **cold half** of the balance              |
| `api.categories.queries.list`           | `{ledgerId}`           | ≤120                  | labels + icons                                |

**The balance is two queries, not one** (`SCHEMA.md` §4.5). Computing "balance as of month M" as a
single `lte(monthKey, M)` range includes the row that every item write patches, so entering one
expense would re-read ~120 documents on every member's device. Split:

```ts
balance = balanceBefore.netMinor + (month.incomeMinor - month.expenseMinor);
```

`balanceBefore` excludes the current month, so it is cold, cacheable per `(ledgerId, monthKey)`, and
**shared across every member of the ledger**.

**Month pager.** A three-page Reanimated pager `[prev, current, next]`, swipeable **on both
platforms** (the legacy set `scrollEnabled={Platform.OS === 'ios'}`, so Android users could only use
the arrows). Only the centre page subscribes; the neighbours render from
`useStableQuery` values so a swipe never blanks.

**Worst realistic case** — ten years of history: gate 1 + month 1 + donut 40 + balanceBefore 120 =
**162 documents**. Legacy Tab3 walked 100,000 items and re-derived them from
`getDerivedStateFromProps`, i.e. **on every render**, three separate times per mount.

**States.** `undefined` → donut skeleton (a grey ring at the final radius) + 4 category-row skeletons.
Month with zero entries → an empty ring in `role.border` with `t('stats.noDataThisMonth')` in the
centre; the month pager still works. Tapping a category row with a non-zero amount →
`/stats/category/[categoryKey]`.

The donut never exceeds eight slices: seven largest categories by exact selected-mode amount plus one
summed Other slice. Other expands the remaining real rows and never becomes a fake category key. Every
canvas value is repeated in accessible labelled rows; color is supplementary.

**Not ported:** the module-level `colors` array that `Tab3.getDerivedStateFromProps` called
`colors.unshift(color)` on for every render, growing without bound for the life of the process. The
chart palette is a frozen module constant with matched light/dark lightness (§5.4).

## 3.4 Me tab — `(tabs)/me.tsx`

**Purpose.** Account summary + the settings index. Replaces the drawer's account block, the drawer's
gear, and Tab4.

**Queries.** `api.users.queries.me` (already boot-mounted, free), `api.handles.queries.mine` (≤11 docs,
for the rename-cooldown copy), `api.notifications.queries.unreadCount` (boot-mounted).

**Structure.** A `Section[]` array built **in the route file** and handed to
`TabMeMobile` / `TabMeTablet` as props — Martie's exact pattern for `my.tsx` (note `07` §2.2), where
the presentational components stay pure. Rendered with FlashList (even a settings list is a
FlashList in Martie; there is no reason to special-case it).

Sections: 프로필 (avatar, name, @handle → `/profile/me`; editing continues to
`/profile/edit`) · 가계부 (전체 가계부 → `/ledgers`,
현재 가계부 설정 → `/ledger/[activeLedgerId]/settings`) · 앱 (테마, 언어, 알림, 앱 잠금) ·
정보 (공지, FAQ, 의견 보내기, 버전) · 계정 (연결된 계정, 로그아웃, 계정 삭제).

**States.** No loading state — `me` is already resolved (the gate would not have let us here
otherwise). The unverified-email red dot from the legacy drawer moves onto the 프로필 row.

## 3.5 Entry detail — `entry/[itemId]/index.tsx`

| Query                           | Args                       | Docs     | Pagination                           |
| ------------------------------- | -------------------------- | -------- | ------------------------------------ |
| `api.items.queries.get`         | `{itemId}`                 | 1 + gate | —                                    |
| `api.photos.queries.listByItem` | `{itemId}`                 | ≤20      | `.take(PHOTO_SCAN_LIMIT = 20)`       |
| `api.comments.queries.list`     | `{itemId, paginationOpts}` | ≤20/page | `COMMENT_PAGE_SIZE = 20`             |
| `api.ledgers.queries.roster`    | `{ledgerId}`               | ≤16      | sidecar (already warm from the list) |

4 subscriptions. Comment authors beyond the roster (a member who has since left) resolve through
`loadAuthorMap`, which is bounded at ≤20 distinct authors per page.

**Preserved from legacy:** the CONSUME/INCOME header word driven by `type`, the large amount, category
icon + label, `date + time` line, the tappable location line → `place/view` (label/address + external
Maps `Linking`, no embedded map SDK), the memo paragraph, a
6-photo preview grid with SEE ALL, and the comment thread showing **3 then expand**
(`t('entry.seeAllComments', {count})` / `t('entry.foldComments', {count})`), relative timestamps
(`date-fns/formatDistanceToNow`, not `moment().fromNow()`), delete-own-comment, and the bottom
composer.

**Changed:** the amount is tinted by `text.expense` / `text.income`, not by the ledger accent (D4).
Edit permission is `authorId === me || isAdmin`; `itemWritePolicy` controls who may create new items,
never who may rewrite another member's existing item.

**States.** `get === undefined` → a full detail skeleton. `get === null` (deleted by a co-member while
you were reading) → `<EntryGoneState/>` with 목록으로 — the legacy did
`componentDidUpdate: if (key changed) goBack()`, which raced. Comments `LoadingFirstPage` → 2 skeleton
rows; empty → the composer with `t('entry.beFirstToComment')`.

## 3.6 LedgerItem form — `ledger/[ledgerId]/item/new.tsx` and

`ledger/[ledgerId]/item/[itemId]/edit.tsx`

Both render `<EntryForm mode="create" | "edit">`. **Queries:** `api.categories.queries.list`
(sidecar, already warm) and `api.ledgers.queries.get` (1 doc — for `baseCurrency`, `timeZone`,
`maintenanceLock`, `itemWritePolicy`). In edit mode also `api.items.queries.get`.

**Mutations:** `api.items.mutations.create` / `update` are called directly with mandatory
`clientRequestId` (update also carries `expectedUpdatedAt`); `softDelete` remains online-only. After a successful primary item
write, `api.files.mutations.generateUploadUrl`, `api.files.mutations.claimUpload`, and
`api.photos.mutations.attach` handle each new photo. Existing-photo removal uses
`api.photos.mutations.detach`. `maintenanceLock !== 'NONE'` disables the save button with an inline
explanation rather than failing after the tap.

**Pagination:** none. The category sheet renders ≤120 rows from an already-loaded sidecar.

**States.** Saving the primary fields → the button becomes a spinner and the form goes
`pointerEvents="none"` (never a full-screen `react-native-loading-spinner-overlay`). After that item
mutation returns its real Convex id, photo processing/upload shows per-tile progress while the saved
item remains durable. A failed photo keeps the form open with “항목은 저장됐지만 사진 N장을 올리지
못했어요”, Retry, Remove, and Done actions; it never rolls the item back. Validation errors are inline
under the field, not `Alert.alert`.

**Field and keyboard contract.** Phone order is type segment → prominent amount → category → date/time
→ memo → receipt photos → migrated-place summary → save. The amount uses the custom minor-unit
`AmountKeypad` from `money-categories-i18n.md` §1.5, not an OS numeric keyboard. The keypad occupies a
fixed lower panel, may collapse after amount entry, and never covers the safe-area save action. Tablet
uses the same state machine in a centred two-column body: fields on the left, keypad/photo preview on the
right. Category selection is a ≤120-row bottom sheet. Date/time uses
`@react-native-community/datetimepicker@9.1.0`, Expo SDK 57's compatibility pin. Picker fields are wall
clock values in `ledgers.timeZone`; submit converts them with shared `wallClockToEpochMs`, and the server
still re-derives `dayKey`, `monthKey`, and `occurredOffsetMinutes`.

**Draft contract.** An unsubmitted financial form is component state only. Save sends validated fields
directly to Convex and never serializes them locally. Receipt images/local URIs are never persisted. An
app kill before the server result discards the draft; only the authoritative result preserves the real
item. Edit mode never applies pending photo deletions before the primary field mutation succeeds.

**Complete create/edit + photo sequence.** This is the client counterpart of `SCHEMA.md` §5.1/§7.5:

1. Validate amount/category/wall-clock fields locally; reject a live maintenance lock or missing connection.
2. Run `items.create` or `items.update` directly. Create returns the
   real `Id<'ledgerItems'>`; update may return `CONFLICT` for review. The client never fabricates/casts an id.
3. For each selected local image, generate a max-1600 px JPEG at quality 0.8 and a 320 px thumbnail with
   `expo-image-manipulator`. Original/thumbnail pairs may process and upload concurrently within a small
   client queue.
4. For each blob call `files.generateUploadUrl`, POST bytes to that URL, read `{storageId}` from the POST
   response, then immediately call `files.claimUpload`. A storage id does not exist before the POST.
5. Once both claimed ids exist, call `photos.attach`. It verifies caller/ledger/item ownership, inserts
   `itemPhotos`, patches `coverPhotoId`/`photoCount`, and attaches both `uploads` rows atomically. It never
   calls `ctx.storage.getUrl()` or returns either storage id.
6. Retry only the failed tile. A claimed but unattached blob expires through the claimed-row sweep;
   POST-success/claim-crash blobs expire through the bounded `_storage` sweep after
   `UPLOAD_CLAIM_TTL_MS`.
7. In edit mode, confirmed removals call `photos.detach` only after the primary update and new attaches
   succeed. Done returns to the real saved item route even if the user chose to abandon failed photos.

## 3.7 Ledger admin screens

| Route                    | Queries                                                                   | Pagination                                                                           | Empty / error                                                                                        |
| ------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `ledger/[id]/settings`   | `api.ledgers.queries.get` (1)                                             | —                                                                                    | `null` → "가계부를 찾을 수 없어요"                                                                   |
| `ledger/[id]/members`    | `api.members.queries.list` (16) · `api.invites.queries.listPending` (≤20) | `.take(MEMBER_SCAN_LIMIT = 200)`, FlashList without pagination — 200 is the hard cap | ghost rows for unredeemed invites carry `t('ledger.members.pendingInvite')`                          |
| `ledger/[id]/invites`    | `api.invites.queries.listActive` (≤21)                                    | `.take(21)`, cap `ACTIVE_INVITES_PER_LEDGER = 20`                                    | empty → "아직 초대 링크가 없어요" + 새 링크 만들기                                                   |
| `ledger/[id]/requests`   | `api.joinRequests.queries.listPending` (≤100)                             | paginated                                                                            | empty → the route is hidden from the members screen when the count is 0                              |
| `ledger/[id]/audit`      | `api.audit.queries.list`                                                  | `AUDIT_PAGE_SIZE = 30`                                                               | ADMIN+ only; a non-admin sees `<ForbiddenState/>`                                                    |
| `ledger/[id]/categories` | `api.categories.queries.list` (≤120)                                      | —                                                                                    | drag-to-reorder triggers `categories.mutations.materialize` on first edit                            |
| `ledger/[id]/photos`     | `api.photos.queries.listByLedger`                                         | `PHOTO_GALLERY_PAGE_SIZE = 40`, FlashList `numColumns={3}`                           |                                                                                                      |
| `ledger/[id]/currency`   | `api.ledgers.queries.get`                                                 | —                                                                                    | shows the confirm-assumed banner while `currencyIsAssumed`                                           |
| `ledger/[id]/timezone`   | `api.ledgers.queries.get`                                                 | —                                                                                    | changing it takes a `maintenanceLock` — the screen says so before you tap                            |
| `ledger/[id]/danger`     | `api.members.queries.list` (for the transfer picker)                      | —                                                                                    | the last-owner and last-member guards render as disabled rows with reasons, not as post-tap `Alert`s |

**Members screen swipe actions preserved** (explicitly called out in note `01` §5.16): swipe reveals
제거 (right) and 소유권 이전 (left), now via `ReanimatedSwipeable` rows inside FlashList rather than
`react-native-smooth-swipe-list`. Actions are attached only when `assertCanActOn` would pass — the row
computes it locally from `roster` so a forbidden action is never even revealed.

## 3.8 Invite screens

| Route           | Query                                                       | Auth          | States                                                                                                                                                                                                                                                                                                                            |
| --------------- | ----------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invite/[code]` | `api.invites.queries.preview({code})` — **public, no auth** | signed-out OK | `OK` → preview card (ledger title, colour, member count, inviter displayName + @handle + avatar, granted role) with a full-width 참여하기. `INVALID`/`EXPIRED`/`REVOKED`/`EXHAUSTED`/`LEDGER_UNAVAILABLE` each get their own copy — an invalid code is indistinguishable from a typo. `alreadyMember` → 열기 instead of 참여하기. |
| `invite/code`   | none until submit                                           | signed-out OK | grouped `BK1-XXXX-…` input with auto-dashes; `normalizeInviteCode` tolerates lowercase, spaces and the Crockford confusables I/L→1, O→0                                                                                                                                                                                           |

Tapping 참여하기 while signed out stores the pending code in SecureStore and routes to
`(auth)/index`. After sign-in **and** handle claim, the root effect pushes back to
`/invite/[code]`. This is one further tap from tap-to-member for a signed-in user, with an optimistic
navigation into the ledger — deliberately _not_ zero-tap (`sharing-invites.md` §2.6: a link pasted in
a group chat is tapped by people who are curious, not by people who consented).

## 3.9 The rest

| Route                                    | Query                                                                                                                       | Pagination                                                                            | Notes                                                                                                                                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search`                                 | `api.items.queries.searchMemo({ledgerId, term, type?, categoryKey?})` or `searchAmount({ledgerId, amountMinor, type?})`     | each `.take(SEARCH_SCAN_LIMIT = 31)` → 30 + `truncated`; memo search ≤1024 candidates | 300 ms/2-char gate for memo. Exact amount is a separate indexed mode because Convex full-text filters cannot run without a text expression. Category is a single exact chip and is cleared in amount mode. |
| `notifications`                          | `api.notifications.queries.list`                                                                                            | `NOTIFICATION_PAGE_SIZE = 20`                                                         | rows are `titleKey`/`bodyKey`/raw `string                                                                                                                                                                  | number`params, rendered in **the reader's** locale;`*Minor`+`currency` are formatted only here |
| `stats/category/[key]`                   | `api.rollups.queries.categoryTrend({ledgerId, categoryKey, fromMonth, toMonth})` (≤12) · `api.items.queries.listByCategory` | drill-down list at 30/page                                                            | tapping a month on the trend line filters the list below (legacy behaviour preserved)                                                                                                                      |
| `profile/me`                             | boot-warm `api.users.queries.me`                                                                                            | —                                                                                     | signed-in self-management only; Edit profile and Change username, never Block/Report                                                                                                                       |
| `u/[handle]`                             | `api.users.queries.byHandle({handleKey})` (2 docs)                                                                          | —                                                                                     | `null` → "없는 사용자예요"                                                                                                                                                                                 |
| `settings/announcements`, `settings/faq` | `api.content.queries.list({kind, locale, now})` | Convex cursor pagination, up to 50 per request and 200 scanned | Sticky FlashList sections; FAQ expands in place and announcements open a detail route |
| `settings/ops` | ADMIN app config plus `reports.open` and `reports.reviewing` | two indexed cursors at 30 rows per page; config 1 | hidden route is not authorization; every server operation still checks ADMIN |
| `(onboarding)/handle` | `api.user.queries.checkHandleAvailability({handle, now})` | one indexed handle row | 800 ms debounce and `skip` while invalid; the mutation re-checks and display names remain non-unique |
| `(onboarding)/ledger`                    | `api.invites.queries.myPendingInvites`                                                                                      | `.take(20)`                                                                           | this is where the invite-drain capability of legacy `addInvitedLedgers` resurfaces                                                                                                                         |

---

# 4. Tablet

## 4.1 The breakpoint mechanism

> **SUPERSEDED 2026-09-09.** The structural breakpoint is now `useTabletLayout()` —
> the window's minimum dimension >= 600dp. See `app/AGENTS.md` and
> `RECONCILIATION.md` § Breakpoint conflict. `media.isTablet` has zero call sites;
> the mechanism described below is retained as the historical rationale only.

The breakpoint originally came from `useCPK().media.isTablet`, powered by `react-responsive`'s
`useMediaQuery` with the `@expo/match-media` side-effect polyfill, inside cpk-ui's own
`providers/ThemeProvider.js`. The flags are `{isPortrait, isMobile, isTablet, isDesktop}` and are
**also spread onto the kstyled theme**, so `${({theme}) => theme.isTablet ? … : …}` works inside
`styled` templates (note `07` §2.1, note `11` §5).

In cpk-ui's default `mobile-first` mode the flags are cumulative: `isMobile` is `{minWidth: 0}` —
literally always true — and `isTablet` is `{minWidth: 767}`. BooKoo therefore performs exactly one
structural test: `isTablet ? <Tablet/> : <Mobile/>`. It never branches on `isMobile`, never creates a
second threshold, and never reads `theme.isTablet` inside a styled template. That single-structural-test
discipline still binds; only its source hook changed, per the note above.

Window-derived values still belong in a small sizing hook, but it deliberately does not own the
breakpoint:

```ts
import {useWindowDimensions} from 'react-native';
import {useTabletLayout} from '~/hooks/useTabletLayout';

export interface LayoutMetrics {
  width: number;
  height: number;
  isLandscape: boolean;
  gutter: number;
  /** Centred reading column for settings / forms / detail panes. */
  contentMaxWidth: number;
  /** The calendar / list sidebar in a two-pane screen. */
  sidebarWidth: number;
  /** Photo grid columns. */
  gridColumns: number;
}

export function useLayoutMetrics(): LayoutMetrics {
  const isTablet = useTabletLayout();
  const {width, height} = useWindowDimensions();
  const isLandscape = width > height;
  const gutter = isTablet ? 24 : 16;
  const contentMaxWidth = isTablet ? Math.min(680, width - gutter * 2) : width;
  const sidebarWidth = isTablet
    ? Math.min(420, Math.round(width * 0.38))
    : width;
  const gridColumns = width >= 1100 ? 5 : width >= 768 ? 4 : 3;
  return {
    width,
    height,
    isLandscape,
    gutter,
    contentMaxWidth,
    sidebarWidth,
    gridColumns,
  };
}
```

`@expo/match-media@^0.4.0` stays a direct dependency — cpk-ui imports it internally and it must be
hoisted, exactly as Martie has it.

**The rule** (note `12` §9.4): breakpoint-dependent **sizes** go through `css` inline or a `$`-prop;
breakpoint-dependent **structure** branches the tree. Never a second styled component, never a
breakpoint in the theme.

## 4.2 The file convention — `app/_Tabs/`

Adopted verbatim from Martie (note `07` §1.1, §2.2):

```
app/(app)/(tabs)/index.tsx                       ← thin route: owns the header, picks the variant
app/(app)/_Tabs/TabCalendar/TabCalendarMobile.tsx
app/(app)/_Tabs/TabCalendar/TabCalendarTablet.tsx
app/(app)/_Tabs/TabCalendar/types.ts             ← TabCalendarProps (container) + TabCalendarUIProps (leaf)
```

The route file:

```tsx
export default function CalendarTab(): ReactElement {
  const isTablet = useTabletLayout();
  const activeLedgerId = useLedgerStore((s) => s.activeLedgerId);

  if (!activeLedgerId) return <NoLedgerEmptyState />;

  return (
    <Container>
      <LedgerHeader ledgerId={activeLedgerId} />
      {isTablet ? (
        <TabCalendarTablet ledgerId={activeLedgerId} />
      ) : (
        <TabCalendarMobile ledgerId={activeLedgerId} />
      )}
    </Container>
  );
}

const Container = styled.View`
  flex: 1;
  align-self: stretch;
  background-color: ${({theme}) => theme.bg.basic};
`;
```

Martie sanctions three degrees of effort and **explicitly warns against the first** — its
`TabIndexMobile`/`TabIndexTablet` are 516/522 near-duplicated lines that drift. BooKoo's rule:

| degree                                                                        | when                                                     | BooKoo screens                                                                                             |
| ----------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **1. Full split** — genuinely different trees                                 | only when the tablet layout is a different _composition_ | `TabCalendar`, `TabTimeline`, `TabStats`, `members`, `settings/*` index                                    |
| **2. Wrapper split** — same content, tablet adds a centred `max-width` column | forms and detail screens                                 | `entry/*`, `profile/*`, `ledger/[id]/{settings,currency,timezone,danger}`, `settings/*` leaves, `invite/*` |
| **3. Alias** — `export default Mobile`                                        | no tablet design yet                                     | `audit`, `feedback`, `announcements`, `faq`                                                                |

Degree 2 needs no second file at all — it is `<ScreenBody>`:

```tsx
export default function ScreenBody({
  children,
  flush = false,
}: Props): ReactElement {
  const isTablet = useTabletLayout();
  const {contentMaxWidth} = useLayoutMetrics();
  if (flush || !isTablet)
    return (
      <View
        style={css`
          flex: 1;
        `}
      >
        {children}
      </View>
    );
  return (
    <View
      style={css`
        flex: 1;
        align-items: center;
      `}
    >
      <View
        style={css`
          flex: 1;
          width: 100%;
          max-width: ${contentMaxWidth + 'px'};
        `}
      >
        {children}
      </View>
    </View>
  );
}
```

(Note the kstyled idiom: the unit is _inside_ the interpolation — `${contentMaxWidth + 'px'}`.)

## 4.3 Which screens become two-pane

| Screen                           | Phone                                                               | Tablet                                                                                                                                                                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Calendar**                     | collapsing header → calendar (collapsible to a week row) → day list | `[ calendar, fixed month mode, sidebarWidth ≈420 ] │ [ day list ]`. Collapse is **disabled** (`mode='month'`, no `collapseProgress`) because there is vertical room for six rows and a list at once — a component-level branch, not a style branch (`calendar-component.md` §6.2). |
| **Timeline**                     | sectioned infinite list; row tap pushes `entry/[itemId]`            | `[ sectioned list, sidebarWidth ] │ [ entry detail pane ]`. Row tap swaps the pane; it does **not** push. Deep-linking to `/entry/[itemId]` on tablet opens the tab with that entry selected.                                                                                      |
| **Stats**                        | month pager → donut → category list; row tap pushes the trend       | `[ donut + balance, sidebarWidth ] │ [ category list + selected category's 12-month trend ]`                                                                                                                                                                                       |
| **Me / settings**                | section list; row tap pushes                                        | `[ section list, sidebarWidth ] │ [ the selected settings leaf ]` (Martie's `TabMyTablet` shape, one level richer)                                                                                                                                                                 |
| **Members / Invites / Requests** | three pushed screens                                                | one screen: `[ segmented: 멤버 · 초대 · 승인대기 + list ] │ [ member detail or the create-link sheet ]` (`sharing-invites.md` §7)                                                                                                                                                  |
| **Photos** (item + ledger)       | 3 columns                                                           | `gridColumns` 4–5; the viewer stays a full-screen modal on both                                                                                                                                                                                                                    |
| **Entry form**                   | full screen modal                                                   | `<ScreenBody>` centred at `contentMaxWidth`; the modal is a `formSheet`                                                                                                                                                                                                            |

The tablet detail pane is a plain component, not a nested navigator: it takes
`selectedItemId: Id<'ledgerItems'> | null` from a per-tab zustand slice. When `null` it renders
`<PaneEmptyState/>` ("항목을 선택하세요"). Pushing a _modal_ (photo viewer, place picker) still uses the
router on both form factors.

## 4.4 The tab bar on tablet

`(tabs)/_layout.tsx` returns `<TabletRail/>` when `isTablet`, a 88 pt vertical rail on the leading
edge holding the same five destinations plus, at the top, the ledger switcher trigger (accent dot +
emoji) and, at the bottom, the notification bell. It renders the same `<Tabs>` with
`tabBarPosition="left"` where the platform supports it and falls back to a hand-rolled rail +
`router.replace` otherwise. Routes, deep links and state are identical — only the chrome differs.

**What must not be ported:** `src/utils/Styles.ts`'s global `ratio` scalar
(`(16 * (width/height))` normalised against a 360 dp baseline) multiplied **every dimension in the
app**. On a tablet that scalar balloons and the app draws phone layout at huge size. Note `01` §13
names this as exactly why the legacy has no tablet layout. There is no global scale factor in the
rewrite; `useLayoutMetrics()` returns discrete, named numbers.

---

# 5. Theming

## 5.1 The hard constraint

cpk-ui's `genTheme()` builds the runtime theme by spreading exactly four keys — `bg`, `role`, `text`,
`button`. **A new top-level group typechecks and is dropped at runtime** (note `12` §7.2, documented
in FightingHows' `src/theme.ts`). Every BooKoo token therefore lives inside one of those four
buckets. Anything that cannot (the per-ledger accent) is not a theme token at all (D4, §5.3).

Merge semantics: the custom theme is deep-merged per top-level group and per button variant over
cpk's built-in `light`/`dark`, so anything omitted falls back to a cpk default. We nevertheless
specify **every** token below, including the ones that happen to match cpk, so the palette is
auditable in one place.

## 5.2 `src/theme.ts`

```ts
import type {CpkThemeParams} from 'cpk-ui/utils/theme';

export type CustomAppTheme = CpkThemeParams & {
  bg: {
    basic: string;
    paper: string;
    disabled: string;
    /** Bottom sheets, dialogs, the ledger switcher. */
    sheet: string;
    /** Scrim behind any modal surface. */
    scrim: string;
    /** Headers and the tab bar — separated from bg.basic so a future frosted header is one edit. */
    chrome: string;
    /** Skeleton fill. MUST differ from bg.paper or skeletons vanish on grouped screens. */
    skeleton: string;
    /** Selected row / pressed list item. */
    highlight: string;
  };
  role: {
    primary: string;
    secondary: string;
    success: string;
    warning: string;
    danger: string;
    info: string;
    accent: string;
    link: string;
    border: string;
    underlay: string;
    underlayContrast: string;
    /** Hairline between list rows — lighter than `border`. */
    divider: string;
    /** Money semantics. Fills/dots only; the TEXT variants are in `text.*`. */
    income: string;
    expense: string;
    /** Chart gridlines and the empty donut ring. */
    chartGrid: string;
    /** Focus ring / accessibility outline. */
    focus: string;
  };
  text: {
    basic: string;
    label: string;
    placeholder: string;
    disabled: string;
    validation: string;
    contrast: string;
    /** ≥4.5:1 on BOTH bg.basic and bg.paper. This is what money is rendered in. */
    income: string;
    expense: string;
    /** Weekend column + Sunday date numbers in the calendar. */
    weekend: string;
  };
  button: {
    primary: {bg: string; text: string};
    secondary: {bg: string; text: string};
    success: {bg: string; text: string};
    warning: {bg: string; text: string};
    danger: {bg: string; text: string};
    info: {bg: string; text: string};
    light: {bg: string; text: string};
    disabled: {bg: string; text: string};
  };
};

export const light: CustomAppTheme = {/* below */};
export const dark: CustomAppTheme = {/* below */};
export const theme = {light, dark}; // ← the shape CpkProvider's customTheme wants
```

### 5.2.1 `bg`

| token          | light                 | dark               | note                                                            |
| -------------- | --------------------- | ------------------ | --------------------------------------------------------------- |
| `bg.basic`     | `#FFFFFF`             | `#101624`          | page background; also `SystemUI.setBackgroundColorAsync`        |
| `bg.paper`     | `#F4F6FA`             | `#182031`          | cards, grouped rows, the calendar grid                          |
| `bg.disabled`  | `#E4E8F0`             | `#2A3245`          |                                                                 |
| `bg.sheet`     | `#FFFFFF`             | `#1A2334`          | sheets sit _above_ paper in dark, hence lighter than `bg.paper` |
| `bg.scrim`     | `rgba(16,22,38,0.45)` | `rgba(0,0,0,0.60)` |                                                                 |
| `bg.chrome`    | `#FFFFFF`             | `#101624`          | header + tab bar                                                |
| `bg.skeleton`  | `#E8ECF3`             | `#222B3D`          |                                                                 |
| `bg.highlight` | `#EDF3F1`             | `#1B2A28`          | pressed row; a desaturated tint of `role.primary`               |

### 5.2.2 `role`

| token                   | light                  | dark                     | contrast note                                                                                                                |
| ----------------------- | ---------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `role.primary`          | `#0B7A5F`              | `#45E0B4`                | BooKoo teal, descended from the legacy `rgb(29,211,168)`. Light: **5.30:1** with white text. Dark: **10.8:1** on `bg.basic`. |
| `role.secondary`        | `#2F6BE0`              | `#7FB0FF`                | 4.95:1 / 8.2:1                                                                                                               |
| `role.success`          | `#0F7B3F`              | `#4ADE80`                | 5.36:1 / 10.36:1                                                                                                             |
| `role.warning`          | `#9A6400`              | `#F5C451`                | 5.05:1 / 11.06:1                                                                                                             |
| `role.danger`           | `#C22B3A`              | `#FF7A85`                | 5.71:1 / 7.25:1                                                                                                              |
| `role.info`             | `#2F6BE0`              | `#7FB0FF`                | = secondary                                                                                                                  |
| `role.accent`           | `#0FA37F`              | `#3ADFB4`                | **decorative only** (chart series, dots). 3.27:1 in light — never used for text or as a text background.                     |
| `role.link`             | `#2F6BE0`              | `#7FB0FF`                |                                                                                                                              |
| `role.border`           | `#DDE3ED`              | `#2A3245`                | 1.3:1 — structural, non-informational                                                                                        |
| `role.divider`          | `#EDF1F7`              | `#212938`                |                                                                                                                              |
| `role.underlay`         | `rgba(11,122,95,0.10)` | `rgba(69,224,180,0.14)`  | ripple / highlight                                                                                                           |
| `role.underlayContrast` | `rgba(0,0,0,0.80)`     | `rgba(255,255,255,0.80)` |                                                                                                                              |
| `role.income`           | `#0F7B3F`              | `#4ADE80`                | fills and dots                                                                                                               |
| `role.expense`          | `#C22B3A`              | `#FF7A85`                | fills and dots                                                                                                               |
| `role.chartGrid`        | `#E6EBF3`              | `#252E40`                |                                                                                                                              |
| `role.focus`            | `#0B7A5F`              | `#45E0B4`                | 3px outline, ≥3:1 against both adjacent surfaces                                                                             |

### 5.2.3 `text`

| token              | light     | dark      | contrast on `bg.basic`                                                                          |
| ------------------ | --------- | --------- | ----------------------------------------------------------------------------------------------- |
| `text.basic`       | `#10131A` | `#F2F5FA` | 18.6:1 / 16.4:1                                                                                 |
| `text.label`       | `#414D6B` | `#B9C2D4` | 8.27:1 / 10.0:1 — the legacy `$darkGrey`, kept                                                  |
| `text.placeholder` | `#65748F` | `#8A94A8` | **4.75:1** / 5.98:1 — deliberately darker than the obvious `#7C8AA5` (3.43:1), which would fail |
| `text.disabled`    | `#A3ADC0` | `#5C687D` | 2.6:1 / 2.9:1 — WCAG exempts disabled controls; never used for information                      |
| `text.validation`  | `#C22B3A` | `#FF7A85` | 5.71:1 / 7.25:1                                                                                 |
| `text.contrast`    | `#FFFFFF` | `#0B1018` | ink on a filled surface                                                                         |
| `text.income`      | `#0F7B3F` | `#4ADE80` | 5.36:1 on basic, **4.91:1 on `bg.paper`**                                                       |
| `text.expense`     | `#C22B3A` | `#FF7A85` | 5.71:1 on basic, **5.20:1 on `bg.paper`**                                                       |
| `text.weekend`     | `#C22B3A` | `#FF7A85` | Sunday numbers; paired with a `weekend` a11y label, never colour alone                          |

### 5.2.4 `button`

| variant     | light bg  | light text | dark bg   | dark text |
| ----------- | --------- | ---------- | --------- | --------- |
| `primary`   | `#0B7A5F` | `#FFFFFF`  | `#45E0B4` | `#06231B` |
| `secondary` | `#EEF2F8` | `#10131A`  | `#2A3245` | `#F2F5FA` |
| `success`   | `#0F7B3F` | `#FFFFFF`  | `#4ADE80` | `#06230F` |
| `warning`   | `#9A6400` | `#FFFFFF`  | `#F5C451` | `#2B1D00` |
| `danger`    | `#C22B3A` | `#FFFFFF`  | `#FF7A85` | `#2A0509` |
| `info`      | `#2F6BE0` | `#FFFFFF`  | `#7FB0FF` | `#04122B` |
| `light`     | `#F4F6FA` | `#10131A`  | `#222B3D` | `#F2F5FA` |
| `disabled`  | `#EDF1F7` | `#A3ADC0`  | `#1C2434` | `#5C687D` |

Every `{bg, text}` pair is ≥4.5:1. The dark-mode pattern is the cpk convention inverted properly:
a light saturated fill with near-black ink of the same hue family, not pure `#000000` (which reads as
a hole).

## 5.3 The ledger accent (legacy `info.color` 0..5)

`SCHEMA.md` §3.5 replaced the integer with a named union
`'PINK' | 'ORANGE' | 'YELLOW' | 'TEAL' | 'BLUE' | 'PURPLE'` precisely because _"dark mode needs TWO hex
values per colour so a raw index cannot be the source of truth."_ The client side of that:

```ts
// src/theme/ledgerAccent.ts   — NOT part of the kstyled theme (see D4)
import type {Doc} from '@convex/_generated/dataModel';

export type LedgerColorKey = Doc<'ledgers'>['colorKey'];

export interface AccentSet {
  /** Filled identity surfaces: calendar selected-day disc, FAB, header band, switcher dot. */
  base: string;
  /** Ink that goes ON `base`. Always ≥4.5:1 against it. */
  on: string;
  /** The accent used AS TEXT on bg.basic / bg.paper. Always ≥4.5:1. */
  text: string;
  /** Tinted surface: selected chip, ledger card background, today's ring fill. */
  subtle: string;
  /** 1px outline on `subtle`. */
  border: string;
}

export const LEDGER_ACCENTS: Record<
  LedgerColorKey,
  {light: AccentSet; dark: AccentSet}
> = {
  PINK: {
    light: {
      base: '#C42A50',
      on: '#FFFFFF',
      text: '#C42A50',
      subtle: '#FDEDF1',
      border: '#F5C6D2',
    },
    dark: {
      base: '#FF8FA8',
      on: '#3A0714',
      text: '#FF8FA8',
      subtle: '#3A1C25',
      border: '#5E2C3A',
    },
  },
  ORANGE: {
    light: {
      base: '#A85A00',
      on: '#FFFFFF',
      text: '#A85A00',
      subtle: '#FBF0E3',
      border: '#EDCFA6',
    },
    dark: {
      base: '#F7A94A',
      on: '#2A1600',
      text: '#F7A94A',
      subtle: '#3A2A12',
      border: '#5C4321',
    },
  },
  YELLOW: {
    light: {
      base: '#8A6D00',
      on: '#FFFFFF',
      text: '#8A6D00',
      subtle: '#FAF3DC',
      border: '#E8D89B',
    },
    dark: {
      base: '#F2D14B',
      on: '#241D00',
      text: '#F2D14B',
      subtle: '#3A3312',
      border: '#5C5220',
    },
  },
  TEAL: {
    // legacy default + legacy fallback
    light: {
      base: '#0B7A5F',
      on: '#FFFFFF',
      text: '#0B7A5F',
      subtle: '#E4F5EF',
      border: '#A9DECE',
    },
    dark: {
      base: '#45E0B4',
      on: '#06231B',
      text: '#45E0B4',
      subtle: '#123329',
      border: '#1F5544',
    },
  },
  BLUE: {
    light: {
      base: '#2F6BE0',
      on: '#FFFFFF',
      text: '#2F6BE0',
      subtle: '#EAF0FD',
      border: '#B9CDF6',
    },
    dark: {
      base: '#7FB0FF',
      on: '#04122B',
      text: '#7FB0FF',
      subtle: '#16233A',
      border: '#2C4370',
    },
  },
  PURPLE: {
    light: {
      base: '#7B3FD4',
      on: '#FFFFFF',
      text: '#7B3FD4',
      subtle: '#F2EBFC',
      border: '#D3BDF4',
    },
    dark: {
      base: '#C79BFF',
      on: '#1B0733',
      text: '#C79BFF',
      subtle: '#2A1B3F',
      border: '#452C63',
    },
  },
};
```

**Measured contrast** (WCAG 2.1 relative luminance; `light` measured against `bg.basic #FFFFFF`,
`dark` against `bg.basic #101624`):

| accent | light `on`-on-`base` | light `text`-on-basic | dark `on`-on-`base` | dark `text`-on-basic |
| ------ | -------------------: | --------------------: | ------------------: | -------------------: |
| PINK   |               5.51:1 |                5.51:1 |              8.00:1 |               8.44:1 |
| ORANGE |               5.18:1 |                5.18:1 |              8.81:1 |               9.23:1 |
| YELLOW |               4.92:1 |                4.92:1 |             11.18:1 |              11.98:1 |
| TEAL   |               5.30:1 |                5.30:1 |             10.03:1 |              10.81:1 |
| BLUE   |               4.95:1 |                4.95:1 |              8.44:1 |               8.21:1 |
| PURPLE |               6.14:1 |                6.14:1 |              8.45:1 |               8.21:1 |

**All twelve pairs clear AA (4.5:1) for body text.** A unit test asserts this
(`src/theme/__tests__/contrast.test.ts` computes relative luminance from the hex and fails the build
under 4.5, so a future palette tweak cannot regress it).

The legacy raw values (`#FF728D`, `#F6A623`, `#EED100`, `#1DD3A8`, `#679EFF`, `#B669F9`) are **not**
shipped as `base` in light mode: `#EED100` on white is 1.7:1 and was used behind white text in the
legacy `LedgerAdd` full-bleed background. They survive as the migration's `colorKey` mapping and,
recognisably, as the dark-mode `base` family.

### 5.3.1 How the accent interacts with the theme

```tsx
// src/theme/LedgerAccentProvider.tsx
const AccentCtx = createContext<AccentSet>(LEDGER_ACCENTS.TEAL.light);

export function LedgerAccentProvider({children}: {children: ReactNode}): JSX.Element {
  const {themeType} = useCPK();                                   // 'light' | 'dark'
  const activeLedgerId = useLedgerStore((s) => s.activeLedgerId);
  const ledgers = useQuery(api.ledgers.queries.listMine, {});     // already subscribed at boot
  const colorKey = ledgers?.find((l) => l._id === activeLedgerId)?.colorKey ?? 'TEAL';
  const value = LEDGER_ACCENTS[colorKey][themeType === 'dark' ? 'dark' : 'light'];
  return <AccentCtx.Provider value={value}>{children}</AccentCtx.Provider>;
}

export const useLedgerAccent = (): AccentSet => useContext(AccentCtx);
/** For rows that show a ledger OTHER than the active one (the switcher, /ledgers). */
export const useAccentFor = (colorKey: LedgerColorKey): AccentSet => { … };
```

**Where the accent is allowed** (identity surfaces):

- calendar selected-day disc (`base` + `on`) and today's ring (`border` on `subtle`)
- the ledger dot / emoji chip in the switcher, `/ledgers`, and the header
- the header band on `ledgers/new` and `ledger/[id]/settings`
- the `add` tab's filled circle _when a ledger is active_ — otherwise `role.primary`
- the selected chip in the category picker (`subtle` + `text`)

**Where the accent is banned** (and this is a change from the legacy):

- **money.** Legacy tinted every negative amount with the ledger colour (`LedgerListItem`,
  `LedgerItemDetail`, `Tab3`'s donut centre). In light mode a YELLOW ledger rendered expenses at
  1.7:1, and it collides with the income/expense semantic. Money uses `text.expense` / `text.income`,
  always, in every ledger. This is the single most visible deliberate departure from legacy.
- primary buttons, destructive buttons, validation, links — those are `role.*`, so the app's action
  language does not change when you switch ledgers.
- charts — category identity uses the fixed 15-token light/dark mapping in
  `src/theme/chartPalette.ts`; the donut renders at most seven real slices plus Other and never
  `colors.unshift(ledgerColor)`.

The one place the two meet: the **expense/income dot on a calendar cell** uses `role.expense` /
`role.income`, and the _neutral_ dot (an entry that is neither, i.e. `TRANSFER`) uses the accent
`base`. That mirrors `calendar-component.md` §7.5's `dotPalette`, with `expense` corrected from
`ledgerColor ?? theme.role.danger` to `theme.role.expense` for the reason above.

## 5.4 Persistence, system-follow, and the two bugs not to copy

Storage key `Storage.ThemeType`, an MMKV **string** with three states: `'system' | 'light' | 'dark'`.

Martie stores a **boolean** `isDarkMode`, which produces two bugs that note `07` §3.4 documents:

1. `storage.getBoolean` returns `undefined` when never set, so `isDarkMode ? 'dark' : 'light'`
   yields `'light'` on first launch — and because cpk's `ThemeProvider` does
   `useEffect(() => { if (initialThemeType) setThemeType(initialThemeType); else setThemeType(colorScheme); })`,
   **passing a defined `initialThemeType` permanently disables OS dark-mode following.**
2. The root reads the value non-reactively (`storage.getBoolean`), so the `StatusBar` bar-style does
   not update until an unrelated root re-render.

BooKoo's fix, both halves:

```tsx
// app/_layout.tsx
const [themePref] = useMMKVString(Storage.ThemeType);              // REACTIVE at the root
const pref = (themePref ?? 'system') as ThemePref;

<RootProvider initialThemeType={pref === 'system' ? undefined : pref}>
```

Passing `undefined` for `'system'` is what re-enables cpk's `colorScheme` follow. `app.config.ts`
already sets `userInterfaceStyle: 'automatic'` and `android.userInterfaceStyle: 'automatic'`, so the
OS scheme is actually available.

The picker (`settings/appearance.tsx`) is a three-way `RadioGroup`, not a switch:

```tsx
const {changeThemeType} = useCPK();
const [, setPref] = useMMKVString(Storage.ThemeType);
const systemScheme = useColorScheme();

const apply = useCallback(
  (next: ThemePref) => {
    setPref(next); // persist first
    const resolved = next === 'system' ? (systemScheme ?? 'light') : next;
    requestAnimationFrame(() => {
      changeThemeType(resolved);
      void SystemUI.setBackgroundColorAsync(
        resolved === 'dark' ? dark.bg.basic! : light.bg.basic!, // no white flash behind the app
      );
    });
  },
  [changeThemeType, setPref, systemScheme],
);
```

`requestAnimationFrame` replaces Martie's `setTimeout(…, 100)` — same intent (let the control's
animation commit before the tree re-themes), one frame instead of a magic number. A separate effect
re-applies when `systemScheme` changes while `pref === 'system'`, which Martie has no path for at all.

Status-bar sync, from the reactive root value:

```tsx
useEffect(() => {
  if (Platform.OS === 'android') StatusBar.setBackgroundColor(theme.bg.chrome);
  StatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content');
}, [isDark, theme]);
```

`changeThemeType(undefined)` **toggles** in cpk-ui; `changeThemeType('dark'|'light')` **sets**. Always
pass an explicit value.

## 5.5 `src/styled.d.ts`

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

Two augmentations, because cpk-ui's `CpkTheme` is itself an empty interface declared open for
merging. `import 'kstyled';` is required to make the file a module. `tsconfig.json` must list it
explicitly:

```jsonc
"files": ["environment.d.ts", "src/styled.d.ts"],
"include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts", "src/styled.d.ts"],
"paths": {"~/*": ["./src/*"], "@convex/*": ["./convex/*"]}
```

Note the `media` flags (`isTablet` etc.) still arrive on the theme from cpk-ui's provider, and
`CpkThemeBase` types them as optional. Structural branches read `useTabletLayout()` directly;
an accidental `theme.isTablet` in a template is still legal at type level, so the ESLint rule
`no-restricted-syntax: MemberExpression[object.name='theme'][property.name=/^is(Tablet|Mobile|Desktop|Portrait)$/]`
bans it and points at the route-level `isTablet` branch.

## 5.6 kstyled rules that shape every component

From note `12` §5 (the performance contract) and §6 (verified silent failure modes):

- **Static template → hoisted to `StyleSheet.create` at build time. Any `${…}` → that one property is
  computed per render.** So `background-color: ${({theme}) => theme.bg.paper};` is fine (one property),
  but a whole style block behind a conditional is not.
- ❌ **Block / conditional interpolations are silently dropped.** `${p => p.$active ? 'color: red;' : ''}`
  produces nothing. Use a single-property interpolation or two styled components.
- ❌ **CSS comments corrupt the next property.** None, anywhere.
- ❌ **`p => p.theme` inside `css` throws at render** — `css` has no props context. Dynamic values
  inside ` css` `` come from `useCPK().theme` (a JS value).
- ❌ **Barrel/namespace imports of `styled` fall back to the runtime parser** (slower, weaker). Always
  `import {styled, css} from 'kstyled';`.
- Numeric interpolation must carry its unit inside the expression: `${top + 'px'}`.
- `styled.X` declarations go at the **bottom** of the file, after the component.
- For list rows: every property that changes per row must be a **transient `$`-prop** on a single
  styled component, never a new styled component per state (note `12` §8).

---

# 6. State: what lives where

## 6.1 The rule

> **Convex** if two devices or two people must agree on it.
> **SecureStore** if leaking it harms the user.
> **Plain MMKV** only for non-sensitive first-frame hints; never for server data or mutation arguments.
> **zustand** if it is UI state that dies with the process.
>
> Ties break toward Convex. Server truth is never mirrored into persistent device storage.

## 6.2 The table

| Value                                                                                         | Home                                      | Key / query                                           | Why                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ledgers, members, items, comments, photos, categories, rollups, invites, audit, notifications | **Convex**                                | `SCHEMA.md`                                           | shared, multi-device                                                                                                                                                                                              |
| Profile: displayName, avatar, bio, handle                                                     | **Convex**                                | `userProfiles`                                        | co-members render it                                                                                                                                                                                              |
| `preferredLocale`                                                                             | **Convex** + MMKV mirror                  | `userProfiles.preferredLocale` / `Storage.Locale`     | push and invite emails are rendered **server-side in the recipient's language**; the legacy rendered the notification body on the _sender's_ device in the _sender's_ language and pushed that string to everyone |
| Base currency, timezone, `weekStartsOn`, `periodStartDay`                                     | **Convex**                                | `ledgers.*`                                           | per-ledger, must agree across members. Legacy kept currency in device AsyncStorage — three members of one ledger could enter three currencies with no record.                                                     |
| Notification preferences (per kind, per ledger, quiet hours)                                  | **Convex**                                | `userProfiles` / `ledgerMemberState`                  | the server decides whether to send and coalesces item activity; a device-local switch cannot                                                                                                                      |
| `onboardingStep`                                                                              | **Convex**                                | `userProfiles.onboardingStep`                         | `auth-onboarding.md` §9.2: only `handle` is derivable; storing it is what makes "kill the app mid-flow" resume correctly                                                                                          |
| Session tokens (access + refresh)                                                             | **SecureStore**                           | via `ConvexAuthProvider storage`                      | credentials                                                                                                                                                                                                       |
| App-lock record (scrypt verifier, salt, biometrics flag, attempts, `lockedUntil`)             | **SecureStore**                           | `bookoo.applock.v1`, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` | a PIN in MMKV is a PIN in plaintext-adjacent storage; the legacy literally wrote `LOCKED_NUMBER = "1234"` to AsyncStorage                                                                                         |
| Pending invite code                                                                           | **SecureStore**                           | `pendingInviteCode`, 24 h TTL                         | survives the OAuth bounce and an Android cold restart mid-flow                                                                                                                                                    |
| `lock.enabled`, `lock.lastActiveAt`                                                           | **MMKV**                                  | `Storage.LockEnabled`, `Storage.LockLastActiveAt`     | must be read **synchronously at module scope** so `stage` starts as `'locked'` and the lock paints on frame 1. Neither is a secret; SecureStore is the authority for everything else in the record.               |
| Theme preference `'system'│'light'│'dark'`                                                    | **MMKV**                                  | `Storage.ThemeType`                                   | needed before the first frame to avoid a light flash                                                                                                                                                              |
| UI locale                                                                                     | **MMKV**                                  | `Storage.Locale`                                      | on the boot path; SecureStore reads are slow enough to feel                                                                                                                                                       |
| `activeLedgerId`                                                                              | **zustand → MMKV**                        | `Storage.ActiveLedgerId`                              | must survive relaunch; validated against `listMine` on boot. Legacy stored an **index**, which pointed at a different ledger whenever the list reordered.                                                         |
| `sessionHint` (`hadSession`, `lastStage`, `lastOnboardingStep`, `writtenAt`)                  | **MMKV**                                  | `Storage.SessionHint`, 30-day TTL                     | PII-free rendering hint only; handle/name/id/content are forbidden here                                                                                                                                           |
| Notice read watermark                                                                         | **MMKV**                                  | `Storage.NoticesLastReadPublishedAt`                  | largest NOTICE `publishedAt` actually rendered on this device; never `Date.now()`, so offline/error visits and clock skew cannot erase the dot                                                                    |
| Onboarding "tutorial seen"                                                                    | —                                         | **not stored**                                        | the three-page hero is folded into the auth landing and never blocks sign-in; there is no flag to keep                                                                                                            |
| Calendar `monthKey` / `selectedDayKey`                                                        | **zustand**                               | `useCalendarStore`                                    | UI state; resets to today on ledger switch                                                                                                                                                                        |
| Timeline filter (`type`), stats mode (expense│income), stats `monthKey`                       | **zustand**                               | `useTimelineStore`, `useStatsStore`                   | a filter that survived a relaunch would confuse                                                                                                                                                                   |
| Tablet pane selection (`selectedItemId` per tab)                                              | **zustand**                               | slices on the same stores                             | dies with the process by design                                                                                                                                                                                   |
| Global overlay visibility (ledger switcher, soft update)                                      | **zustand**                               | one `{visible}` store each                            | hard update/maintenance are BootGate states, not overlays                                                                                                                                                         |
| Place-picker handoff (`{lat, lng, label}` returning from the map modal)                       | **zustand**                               | `usePlacePickerStore`                                 | replaces the legacy `onSelectLocation` **callback passed through navigation params**                                                                                                                              |
| In-progress form text (amount, memo, half-typed handle)                                       | **component state**                       | —                                                     | deliberately not persisted: restoring a half-typed handle after a crash is worse than an empty focused field                                                                                                      |
| Push token                                                                                    | **Convex** (`pushTokens`) + no local copy |                                                       | the legacy wrote it to AsyncStorage under `push` and then wrote `undefined` over it                                                                                                                               |

**zustand house style** (note `07` §5): `create<State & Action>()(immer(set => …))`, split `State` /
`Action` interfaces, an `initialState` const, a named `useXStore` export, and **selector subscriptions
at every call site** (`useLedgerStore((s) => s.activeLedgerId)`) — never whole-store destructuring on
a list screen. MMKV-backed stores hydrate at module scope and write through inside the setter; no
`persist` middleware.

**AsyncStorage is not a dependency.** Every one of the 13 legacy keys (note `01` §15) is accounted for
above or explicitly dropped (`token`, `login_type`, `email`, `pw`, `title`, `switch_update`,
`APP_INSTALLED`).

---

# 7. The client performance playbook

The mandate (`DECISIONS.md` §5): the legacy died because `Main.setMyLedgers` did
`ledgers/{key}.once('value')` — pulling `info + members + requests + ALL items + ALL reviews + ALL
picture metadata` into Redux, on **every app start and every ledger switch** — and then re-derived
Tab1, Tab2 and Tab3 from it in `getDerivedStateFromProps`, i.e. on every render.

## 7.1 The written rule (goes into `CLAUDE.md` and `AGENTS.md` verbatim)

> **List & Pagination Rules**
>
> - Any list backed by user-generated, server-side, or otherwise unbounded data must use `FlashList`
>   from `@shopify/flash-list`.
> - Do not render unbounded data with `ScrollView + array.map()` or fetch the full collection with
>   `useQuery` / Convex `.collect()` for screen lists.
> - Pair `FlashList` with Convex pagination (`paginationOptsValidator` on the query,
>   `usePaginatedQuery` on the client) and load more via `onEndReached`.
> - `ScrollView` is only acceptable for static/short-form content, fixed-size controls, forms, detail
>   pages, or deliberately capped preview sections such as "top 5".
> - If a query can grow over time, add the right index for the list sort/filter before adding
>   pagination.

BooKoo adds three clauses:

> - No screen may hold more than **10 live Convex subscriptions** (`SCHEMA.md` §4.1); the timeline's
>   8-page ceiling (21) is the single documented exception and is capped by `MAX_LIVE_ITEM_PAGES`.
> - **No dashboard number may be computed in JS from a list.** Month totals, category shares, day
>   subtotals and the running balance come from `rollups.*`.
> - No client-visible query uses `.collect()`. Even the argument-bounded `rollups.daysInRange` uses
>   `.take(DAY_ROLLUP_SCAN_LIMIT + 1)` and fails if the invariant cap is exceeded.

## 7.2 FlashList for the sectioned day list

FlashList **v2** — there is no `estimatedItemSize` and adding one is wrong (note `07` §9.5).

Flatten sections into a discriminated union so the list stays one flat data array:

```ts
type TimelineRow =
  | {
      kind: 'day';
      key: string;
      dayKey: number;
      incomeMinor: number;
      expenseMinor: number;
    }
  | {kind: 'item'; key: string; item: LedgerItemRow};

const rows = useMemo<TimelineRow[]>(() => {
  const byDay = new Map<number, DayRollup>();
  for (const d of days ?? []) byDay.set(d.dayKey, d); // shards already summed server-side

  const out: TimelineRow[] = [];
  let current: number | undefined;
  for (const item of items.results) {
    if (item.dayKey !== current) {
      current = item.dayKey;
      const r = byDay.get(current);
      out.push({
        kind: 'day',
        key: `d${current}`,
        dayKey: current,
        incomeMinor: r?.incomeMinor ?? 0,
        expenseMinor: r?.expenseMinor ?? 0,
      });
    }
    out.push({kind: 'item', key: item._id, item});
  }
  return out;
}, [items.results, days]);

const stickyHeaderIndices = useMemo(
  () =>
    rows.reduce<number[]>(
      (acc, r, i) => (r.kind === 'day' ? (acc.push(i), acc) : acc),
      [],
    ),
  [rows],
);
```

```tsx
<FlashList
  data={rows}
  keyExtractor={keyExtractor} // useCallback, (r) => r.key
  getItemType={getItemType} // useCallback, (r) => r.kind  ← two recycling pools
  renderItem={renderRow} // useCallback, narrow theme deps
  stickyHeaderIndices={stickyHeaderIndices}
  onEndReached={handleLoadMore}
  onEndReachedThreshold={0.5}
  ListHeaderComponent={renderHeader}
  ListEmptyComponent={renderEmpty}
  ListFooterComponent={renderFooter}
  contentContainerStyle={css`
    padding-bottom: ${bottomInset + 24 + 'px'};
  `}
  extraData={selectedItemId} // REQUIRED: renderRow closes over it on tablet
/>
```

Rules enforced by review:

- `renderItem`, `keyExtractor`, `getItemType`, `renderHeader/Empty/Footer` and `handleLoadMore` are
  **all** `useCallback`-memoized, with **individually listed theme deps**
  (`theme.bg.basic, theme.role.divider`) rather than the whole `theme` object.
- `getItemType` is what stops FlashList recycling a 32 pt day header into a 68 pt entry row and
  measuring on every scroll tick.
- `extraData` is mandatory whenever `renderItem` closes over local state.
- The type filter chips are a horizontal `ScrollView` **inside `ListHeaderComponent`**, so they scroll
  with the list and cost nothing per row.
- `handleLoadMore` fires only on `status === 'CanLoadMore'`, and refuses past
  `MAX_LIVE_ITEM_PAGES`.
- `EntryRow` is wrapped in `React.memo` with a comparator on
  `(item._id, item.updatedAt, isSelected)` — the row does not re-render when a _different_ row's
  comment count changes.

**Legacy equivalents removed:** `deprecated-react-native-listview`'s
`ds.cloneWithRowsAndSections` rebuilt on every render; `convertLedgerItemsToArray` allocating a
`new LedgerItem()` per item then sorting, called from `getDerivedStateFromProps`; the manual
`62 * ratio` footer spacer.

## 7.3 The other lists

| List                         | Component                                        | Pagination           | Note                                                                                      |
| ---------------------------- | ------------------------------------------------ | -------------------- | ----------------------------------------------------------------------------------------- |
| Day list (Calendar tab)      | FlashList                                        | `listByDay`, 30/page | no sections — the header is the calendar                                                  |
| Comments                     | FlashList, `inverted={false}`                    | 20/page              | composer is outside the list, above the keyboard, via `react-native-keyboard-controller`  |
| Members / invites / requests | FlashList + `ReanimatedSwipeable`                | bounded `.take()`    | swipe rows must set `renderRightActions` lazily, not on every row                         |
| Photos (item / ledger)       | FlashList `numColumns={gridColumns}`             | 40/page (ledger)     |                                                                                           |
| Notifications                | FlashList                                        | 20/page              |                                                                                           |
| Settings sections            | FlashList                                        | —                    | yes, even settings — Martie does, and it costs nothing                                    |
| Category picker (≤120)       | FlashList `numColumns={4}` inside a bottom sheet | —                    | bounded by `MAX_CATEGORIES_PER_LEDGER`                                                    |
| Currency picker (~60)        | FlashList + search field                         | —                    |                                                                                           |
| Calendar grid                | **not** a FlashList                              | —                    | a 7×6 fixed grid; `calendar-component.md` §3.3 does the geometry with zero measure passes |

## 7.4 Avoiding re-renders

1. **Sidecars, not joins** (`SCHEMA.md` §4.2). The item list query returns **raw rows**. Labels come
   from two long-lived subscriptions — `ledgers.roster` (target eight: ≤32 docs including block pairs)
   and `categories.list` (≤120) — shared by every loaded page and kept warm by
   `ConvexQueryCacheProvider`. Consequence: a co-member renaming themselves invalidates **nothing** on
   the timeline; only the bounded roster re-runs.
   A 30-row page costs exactly 30 document reads: no `loadAuthorMap` in the list and no
   `ctx.storage.getUrl()` per row. `ledgerItems.coverPhotoId` is the safe routing id for D4's
   authenticated thumbnail endpoint; no storage id or bearer URL is in the list row.
2. **Cold ledger document.** `SCHEMA.md` §3.5 puts **zero hot fields** on `ledgers` — no `lastItemAt`,
   no `itemCount`, no `lastActivityAt`. So the ledger switcher, the first thing after launch, never
   re-renders because somebody typed an expense. The unseen badge is a _separate_ subscription.
3. **Split the balance** (§3.3) so the current month's hot rollup row is not inside the cold read set.
4. **Narrow zustand selectors** everywhere; never destructure a store in a list screen.
5. **`React.memo` + a real comparator** on `EntryRow`, `CalendarCell`, `MemberRow`,
   `CategoryChip`.
6. **Bounded memory-only `ConvexQueryCacheProvider` hooks** (convex-helpers) on application screens.
   An identical query can remain warm for five idle minutes, while a changed month, type filter or
   search argument resets pagination and renders an honest screen/list skeleton until the new result
   arrives. The provider is keyed by authenticated user, capped at 250 idle entries and never persists
   private rows or mutation arguments.
7. **`'skip'`** while route params, the debounce, or `activeLedgerId` are still resolving — never
   a wasted subscription plus an `undefined` render.
8. **Marker identity reuse** in `<LedgerCalendar>`: a module-level `Map` keyed by
   `${dayKey}|${incomeMinor}|${expenseMinor}|${itemCount}|${palette.income}` returns the _same frozen_
   `CalendarMarker` object across Convex pushes that did not change that day, so the cell memo
   comparators bail (`calendar-component.md` §7.5). Capped at 512 entries with FIFO eviction — unlike
   `Tab3`'s `colors` array, which grew forever.
9. **No `getDerivedStateFromProps`, no class components, no string refs** — all three are removed or
   broken in React 19 anyway.

## 7.5 Images

- **`expo-image` everywhere.** Avatars use `cachePolicy="memory-disk"`; receipt `PrivateImage` uses
  `cachePolicy="memory"` so financial bytes never enter Expo Image's disk cache. Every list image sets
  `contentFit`, `transition={120}`, `placeholder={{blurhash}}`, and a stable
  **`recyclingKey={item._id}`** — without it FlashList shows the previous row's photo for a frame.
- **Thumbnails are client-generated, then server-attached.** `ledgerItems.coverPhotoId` and each photo id
  let `PrivateImage` address D4's protected HTTP route without a per-row query or `ctx.storage.getUrl()`.
  The component sends `Authorization: Bearer <useAuthToken()>`; originals and thumbnails are both checked
  against current membership, neither is cached on disk, and no storage/bearer URL enters a document
  projection.
- **Resize before upload.** `expo-image-manipulator` to max 1600 px on the long edge, JPEG q0.8,
  after the primary item mutation. Each POST response is claimed immediately; only then may
  `photos.attach` consume the original/thumbnail pair. Pairs may run in a bounded parallel client queue.
- **Avatars** are a fixed 96 px variant. Never `key={new Date()}` — the legacy drawer did exactly
  that, busting the image cache on every render.
- **No `Asset.loadAsync(ICONS)` preload.** The legacy preloaded ~90 PNGs before first paint. Preset and
  custom categories use cpk-ui's already-registered icon font (`money-categories-i18n.md` §2.4), so
  BooKoo adds no category assets, second icon font, dispatcher, or boot-time preload.

## 7.6 The cold-start sequence

```
t=0    module scope (app/_layout.tsx)
       SplashScreen.preventAutoHideAsync()
       setFontFamily(...)
       MMKV SYNC reads: ThemeType · Locale · ActiveLedgerId · LockEnabled · LockLastActiveAt · SessionHint
       new ConvexReactClient(url, {unsavedChangesWarning: false})
       ↓
t≈10ms RootLayout renders providers with initialThemeType = (pref === 'system' ? undefined : pref)
       SystemUI background already painted from the stored pref → NO white flash
       ↓
       AuthGate:  stage === 'loading'
         · sessionHint.hadSession && lock.enabled  → <LockScreenSkeleton/> (PIN boxes, frame 1)
         · sessionHint.hadSession                  → <AppShellSkeleton/>   (tab bar + header + rows)
         · else                                    → null (native splash stays up)
       ↓
t≈?    useConvexAuth resolves from SecureStore → isAuthenticated
       api.users.queries.me lands (1 doc)  → stage settles
       fonts ready (app fonts + cpk `assetLoaded`)
       ↓
       SplashScreen.hideAsync()
       local diagnostic APP_START {durationBucket, hadHint}; never automatically uploaded
       ↓
       LegacySensitiveStorageCleanup best-effort clears the retired encrypted file/key without blocking.
       ↓
       socket up → live values paint into geometry-matched rows.
       If the socket is still down after 3 s, connection guidance appears; old private data never paints.
```

`offline-and-caching.md` owns the server-authority, online-write and retired-storage cleanup contract. No
screen may implement a persistent cached query.

**Budget, from `observability.md`:** module start → first painted app frame for a warm,
already-authenticated user, **sample p50 ≤450 ms, p95 ≤900 ms** over at least 20 production-mode cold
starts/reference device. It is release-benchmark evidence, not an uncollected fleet percentile.

**Skeletons must match final row heights exactly** (note `13` §7.4 point 2). `EntryRowSkeleton` is
built from the same `EntryRow` container styled component with `$skeleton` set, so the height cannot
drift.

## 7.7 Optimistic updates

`items.create` never inserts a fake document into a Convex query cache. In particular, it never uses a
random string cast to `Id<'ledgerItems'>`: Convex document ids come only from the create mutation or a
query. There is no `PendingEntryRow`, local id, local rollup adjustment, or optimistic paginated document
for a write that the server has not confirmed. Photo progress remains local form state and never
impersonates an attached `itemPhotos` row.

Convex calls retain their server idempotency/revision contract, but BooKoo does not persist or replay an
offline mutation queue. An unchanged ambiguous retry in the same mounted form reuses its in-memory
`clientRequestId`; changing the draft allocates a new id. A disconnected attempt preserves the visible
form, reports the connection requirement and offers Retry. Photos and every other mutation are never
queued or presented as successful before their server response.

## 7.8 The audit checklist (`/perf-audit` runs this)

- [ ] Every unbounded list is FlashList + `usePaginatedQuery`.
- [ ] No `ScrollView + .map()` over server data.
- [ ] No `.collect()` on a client-visible query; bounded ranges use a named `.take()` cap.
- [ ] No `.filter()` on `ledgerItems`.
- [ ] Every dashboard number comes from `rollups.*`.
- [ ] Every `renderItem` / `keyExtractor` / `getItemType` is `useCallback`-memoized with narrow deps.
- [ ] `getItemType` present on every heterogeneous list.
- [ ] `extraData` present wherever `renderItem` closes over state.
- [ ] `recyclingKey` on every list `expo-image`.
- [ ] `estimatedItemSize` **absent** (FlashList v2).
- [ ] No screen exceeds 10 subscriptions except the timeline at its documented ceiling.
- [ ] `useStable*Query` on every screen whose args change.
- [ ] `'skip'` while args are unresolved.
- [ ] No `Date.now()` inside a Convex query (it destroys the argument cache key).

---

# 8. Component inventory

## 8.1 cpk-ui 0.7.0 coverage

| Need                              | cpk-ui component                                                            | Use as-is?                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Buttons                           | `Button` (`ButtonType`, `ButtonColorType`, `ButtonSizeType`)                | wrapped → `BkButton` (§8.2)                                                                                                         |
| Text                              | `Typography.{Heading1..5, Body1..3}`, `TypographyInverted`, `setFontFamily` | **as-is; raw `<Text>` is banned**                                                                                                   |
| Text input                        | `EditText` (`EditTextStatus`, styles slots)                                 | as-is; `EntryAmountField` is bespoke                                                                                                |
| Icons                             | `Icon` (`IconName`, `iconList`), `IconButton`                               | as-is for chrome and category icons                                                                                                 |
| Expense/income toggle             | `SegmentedControl`                                                          | **as-is — this replaces the legacy `react-native-tab-view` CONSUME/INCOME tabs**                                                    |
| Settings switches                 | `SwitchToggle`                                                              | as-is                                                                                                                               |
| Radio (theme, language, currency) | `RadioGroup` / `RadioButton`                                                | as-is                                                                                                                               |
| Checkbox                          | `Checkbox`                                                                  | as-is                                                                                                                               |
| Announcements / FAQ accordion     | `Accordion`                                                                 | **as-is — replaces the vendored `DoubleListView` + `react-native-display`**                                                         |
| Cards                             | `Card`                                                                      | as-is (ledger cards, invite preview)                                                                                                |
| Divider                           | `Hr`                                                                        | as-is                                                                                                                               |
| Loading                           | `LoadingIndicator`                                                          | only for full-screen boot; **lists use skeletons**                                                                                  |
| Photo viewer zoom                 | `PinchZoom` (`PinchZoomRef`)                                                | use per page inside `react-native-pager-view@8.0.2`; reset old page on swipe and disable paging while zoomed; no gallery dependency |
| Alerts / confirms                 | `AlertDialog` via `useCPK()`                                                | as-is — replaces every `Alert.alert`                                                                                                |
| Toasts                            | `Snackbar` via `useCPK()`                                                   | as-is — replaces `react-native-snackbar-component`                                                                                  |
| Error boundary                    | `ErrorBoundary` (cpk) + `react-native-error-boundary`                       | two layers, Martie's shape                                                                                                          |
| Status bar                        | `StatusBarBrightness`                                                       | as-is (dir is spelled `StatusbarBrightness`)                                                                                        |
| FAB                               | `Fab`                                                                       | **not used** — the centre tab replaces it                                                                                           |
| Rating                            | `Rating`                                                                    | not used                                                                                                                            |
| Responsive                        | `useTabletLayout()` (window min dimension >= 600dp)                         | **used as the sole structural breakpoint** — see D5                                                                                 |

**Missing from cpk-ui and needed:** a calendar. That is the subject of `calendar-component.md` — a
`<Calendar>` contributed **upstream to cpk-ui** with cpk theme tokens only, consumed here through
`<LedgerCalendar>`. Until it lands, develop against the local checkout per that document's §7.4.

## 8.2 BooKoo components under `src/uis/`

House style (note `07` §7.1): `/** @name X */` header, `export default function X(props: Props): JSX.Element`,
`type Props` immediately above, `styled.*` at the **bottom**, an optional `style?: StyleProp<ViewStyle>`
merged last, `Typography` for all text, first-class `accessibilityLabel` composed by a pure helper in
a sibling `accessibility.ts` that is unit-tested separately.

### Money & entries

| Component              | One-line spec                                                                                                                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Money.tsx`            | Renders `{amountMinor, currency}` via `formatMoney(…, uiLocale, {absolute})`; tints by `type` using `text.income`/`text.expense`; symbol is a separate `<Text>` so it can be styled apart from the digits; adds a second `≈ base` line for foreign-currency rows. |
| `EntryRow.tsx`         | The universal list row (legacy `LedgerListItem`): category icon, label + comment-count superscript, memo line, `<Money/>` on the trailing edge, optional author avatar, optional photo thumb. `React.memo` on `(id, updatedAt, isSelected)`.                      |
| `EntryRowSkeleton.tsx` | Same container styled component with `$skeleton`, so heights cannot drift from `EntryRow`.                                                                                                                                                                        |
| `DaySectionHeader.tsx` | Sticky header: localized date on the leading edge, that day's income and expense totals on the trailing edge (legacy behaviour, now exact across page boundaries).                                                                                                |
| `EntryForm/`           | `index.tsx` (state + mutations, picks Mobile/Tablet) · `EntryFormMobile.tsx` · `EntryFormTablet.tsx` · `types.ts`. One form with a `type` segmented control; used by both `entry/new` and `entry/[itemId]/edit`.                                                  |
| `AmountField.tsx`      | Minor-unit keypad accumulator (`money-categories-i18n.md` §1.5) — live-formatted, exponent-aware, no `parseFloat`, no display-string-as-truth (legacy stored the formatted string _and_ a signed number).                                                         |
| `CategorySheet.tsx`    | Bottom sheet: FlashList grid of the ledger's categories filtered by `type`, a leading "+ 새 카테고리" tile, long-press → reorder/hide (legacy long-press-to-delete, made non-destructive).                                                                        |
| `CategoryIcon.tsx`     | Thin typed wrapper over cpk-ui `<Icon name={iconKey}>`; `iconKey: IconName`, with `Question` as the resolved unknown-category fallback. Takes a theme `color`, so no second asset is needed.                                                                      |
| `IconPickerSheet.tsx`  | Searchable/grouped choices sourced from cpk-ui `iconList`; returns an `IconName` and loads no additional font.                                                                                                                                                    |
| `PhotoStrip.tsx`       | Horizontal thumbnails + a trailing "+" tile; per-tile upload progress ring; tap → `photo/[itemId]?index=`.                                                                                                                                                        |
| `PlaceRow.tsx`         | Pin icon + `place.label`; tap → read-only `place/view`; no empty-state capture action in v1.                                                                                                                                                                      |

### Ledger & people

| Component                 | One-line spec                                                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LedgerDot.tsx`           | The accent dot (or emoji chip) with an owner-crown overlay; takes a `colorKey`, resolves via `useAccentFor`.                                               |
| `LedgerHeader.tsx`        | Tab header: `LedgerDot` + title + chevron (opens the switcher), unseen dot, search icon, bell with unread badge.                                           |
| `LedgerSwitcherSheet.tsx` | Root-mounted `@gorhom/bottom-sheet`; ledger rows + 새 가계부 / 코드로 참여 / 전체 보기. Replaces the entire legacy `SideMenu`.                             |
| `LedgerCard.tsx`          | Ledger row for `/ledgers`: accent subtle background, title, description, member avatars, role chip, archived badge.                                        |
| `AccentPicker.tsx`        | Six swatches rendered from `LEDGER_ACCENTS[key][themeType].base` with a check overlay — the legacy picker's six raw `rgb()` literals with no dark variant. |
| `MemberRow.tsx`           | Avatar, display name, `@handle`, role chip, crown, "링크로 참여 · N일 전"; wrapped in `ReanimatedSwipeable` when the actor may act on the target.          |
| `RoleChip.tsx`            | OWNER / ADMIN / MEMBER / VIEWER pill, colour-coded and **labelled** (never colour alone).                                                                  |
| `InvitePreviewCard.tsx`   | The public invite card: ledger title + accent, member count, inviter avatar/name/@handle, granted role, expiry — and nothing else.                         |
| `InviteCodeInput.tsx`     | Grouped `BK1-XXXX-…` field with auto-dashes, paste-friendly, backed by `normalizeInviteCode`.                                                              |
| `AvatarStack.tsx`         | Overlapping member avatars with a `+N` overflow chip; used on ledger cards and the settings members row.                                                   |
| `Avatar.tsx`              | `expo-image` avatar with initials fallback, `recyclingKey`, fixed 96 px variant, deleted-user ("탈퇴한 사용자") state.                                     |

### Calendar & charts

| Component                  | One-line spec                                                                                                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `LedgerCalendar.tsx`       | Wraps cpk-ui `<Calendar>`: builds every key/today value in `ledger.timeZone`, passes `ledger.weekStartsOn`, subscribes shard-summed `rollups.daysInRange` over the 3-page grid window, builds frozen identity-reused `CalendarMarker`s, and disables collapse on tablet. |
| `MonthPagerHeader.tsx`     | `← 2026년 8월 →` with a tap-to-jump month picker; shared by Calendar and Stats; swipeable on **both** platforms.                                                                                                                                                         |
| `DonutChart.tsx`           | `victory-native`/Skia donut with the running balance in the hole; top 7 + exact Other, stable category-token palette, accessible breakdown mirror, empty `role.border` ring.                                                                                             |
| `CategoryBreakdownRow.tsx` | Category icon, `"{label} ({percent}%)"`, amount, share bar; tap → `stats/category/[key]`.                                                                                                                                                                                |
| `TrendLineChart.tsx`       | 12-month line with a tappable month node that filters the drill-down list below (the legacy hand-drawn `Svg.Polyline` + `Svg.Ellipse` behaviour, on a real chart lib).                                                                                                   |
| `BalanceTile.tsx`          | `balanceBefore + month` composed client-side, with an explicit "이월 잔액" label so the number is explainable.                                                                                                                                                           |

### Chrome, states, layout

| Component                  | One-line spec                                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ScreenBody.tsx`           | Degree-2 tablet primitive: centres children at `contentMaxWidth`, pass-through on phone.                                                                                      |
| `TwoPane.tsx`              | Degree-1 tablet primitive: `[sidebarWidth]│[flex:1]` with a `role.divider` hairline and a `<PaneEmptyState/>` when nothing is selected.                                       |
| `CollapsingHeader.tsx`     | Reanimated v4 scroll-driven collapsing header (replaces the vendored `ParallaxScrollView` and its string refs); accent band → compact title.                                  |
| `TabletRail.tsx`           | The 88 pt vertical rail: switcher trigger, 5 destinations, bell.                                                                                                              |
| `AppShellSkeleton.tsx`     | The frame-1 shell for a returning user: tab bar, header block, 5 `EntryRowSkeleton`s.                                                                                         |
| `SkeletonBox.tsx`          | Reanimated opacity pulse on `bg.skeleton`; every other skeleton composes it.                                                                                                  |
| `EmptyState.tsx`           | Illustration + title + body + optional CTA; the base for `NoLedgerEmptyState`, `NoEntriesEmptyState`, `EntryGoneState`, `ForbiddenState`, `PaneEmptyState`.                   |
| `FallbackComponent.tsx`    | The `ErrorBoundary` fallback — **deliberately dependency-free** (no cpk-ui, no kstyled) so it renders even when the theme provider is what broke.                             |
| `OfflineChip.tsx`          | Appears after 3 s of a down socket; says a connection is required for fresh data and writes, without implying a local copy or pending queue.                                  |
| `BkButton.tsx`             | cpk `Button` + BooKoo defaults (`borderRadius: 12`, haptic on press, a11y defaults, pass-through rest props).                                                                 |
| `GestureHandlerButton.tsx` | Martie's `RectButton`-based re-implementation of cpk `Button` — **required**, because cpk `Button` loses touches inside reanimated modals and BooKoo's sheets are reanimated. |
| `ConfirmSheet.tsx`         | Destructive-action sheet replacing every legacy `Alert.alert(title, body, [Cancel, OK])`; the destructive label is spelled out ("가계부 삭제"), never "확인".                 |
| `PinBoxes.tsx`             | Six presentational boxes driven by **one hidden `TextInput`** — the legacy's six real inputs with manual focus juggling break with Korean IMEs and with paste.                |
| `NotificationRow.tsx`      | Renders `titleKey`/`bodyKey`/`params` in the **reader's** locale; tap resolves through `routeForNotification`.                                                                |

### Hooks (`src/hooks/`)

| Hook                                           | Purpose                                                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `useLayoutMetrics()`                           | §4.1 — width-derived gutters, reading width, sidebar width and grid columns; never a second breakpoint.              |
| `useLedgerAccent()` / `useAccentFor(colorKey)` | §5.3.                                                                                                                |
| `useConnectivity()`                            | Shared Convex socket state for connection guidance and fail-closed write actions; it owns no data or mutation queue. |
| `useLocale()`                                  | reactive locale with a module-level listener array + a fire-and-forget mirror to `userProfiles.preferredLocale`.     |
| `useActiveLedger()`                            | `{ledgerId, ledger, accent, role, canWriteItems}` — resolves the policy knob once so no screen re-derives it.        |
| `useAppLock()`                                 | `auth-onboarding.md` §14.6 — `{enabled, locked, unlockWithBiometrics, unlockWithPin, lockNow, configure, disable}`.  |
| `useSession()`                                 | `auth-onboarding.md` §9.1 — the `SessionStage` machine.                                                              |
| `useMonthPager()`                              | shared `[prev, current, next]` pager state for Calendar and Stats.                                                   |
| `useTimelineRows()`                            | the §7.2 flattening + sticky index computation, so both Mobile and Tablet share one implementation.                  |
| `useAppState(handler)`                         | thin `AppState` wrapper (privacy cover, auto-lock, `touchLastSeen` throttle).                                        |
| `useBootGate()` / `useUpdates()`               | D6 — 1.5 s live-config fail-open; maintenance/hard-native priority; bounded OTA and soft-update handling.            |

---

# 9. Open items

`daysOfMonth` vs `daysInRange` was resolved by `RECONCILIATION.md` R3: only `daysInRange` ships.

1. **`entry/[itemId]` on tablet.** Deep-linking to an entry currently opens the Timeline tab with the
   detail pane selected. If a notification deep-link should instead open a modal over whichever tab
   is active, that is a `+native-intent` change, not a route change.
2. **Ledger-wide photo gallery** (`ledger/[id]/photos`) is new and has no legacy demand signal. It is
   cheap (`itemPhotos.by_ledgerId_deletedAt_createdAt` already exists) but could ship in v1.1.
3. **In-app data export** (`EXPORT_EXCEL` was a never-implemented legacy i18n key) is closed by D4:
   `settings/privacy.tsx` owns personal export history/request/download/delete, and
   `ledger/[id]/settings.tsx` owns ADMIN+ ledger export. Both use expiring protected multipart downloads;
   there is no raw URL in a notification or overflow-only action.
