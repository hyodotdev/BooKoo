# Routes

Rules for this directory. Root rules still apply — see `../AGENTS.md`.

## expo-router

- Typed routes are on (`experiments.typedRoutes: true` in `app.config.ts`).
  Navigate with string literals and **no cast**. A typed-route type error means
  the route file does not exist — create it, never `as any`.
- Use `router.navigate(href)` for ordinary forward navigation: settings,
  profiles, ledger/entry details, editors, pickers, photos and notification
  destinations. Reopening the same destination must not add another copy.
  Keep entity IDs and required params; different records are not one identity.
- App and ledger `Stack.Screen` declarations use `dangerouslySingular` to
  identify destinations by route name and dynamic path IDs. In the installed
  Expo Router, `navigate` alone only reuses the current matching screen; this
  identity also prevents A→B→A duplicates. Query params are not path identity:
  when they identify a different entity or independent draft, define and test
  that identity explicitly before reusing a mounted screen.
- Query-driven read-only selections (photo/comment/page and category/month)
  reset their domain component with a query-context key while keeping one
  navigation route. Do not blanket-key editable forms: returning from a picker
  must preserve the unsaved draft. Cover changed and removed query params and
  one-step Back with the real-router tests.
- `router.push` / `<Link push>` require a demonstrated need for a separate
  instance of the same route, an inline reason and a regression covering Back.
  The current app has no such exception. Do not substitute a debounce or timer
  for correct navigation semantics.
- Preserve `back`, `dismiss`, `dismissTo` and `replace` when closing a sheet,
  returning from a saved form, or crossing an auth/redirect boundary. `navigate`
  is not a global replacement for these operations or a guarantee of singleton
  behavior across distinct route aliases/nested navigators. Test rapid repeated
  taps, A→B→A and one-step Back on each affected route family.
- Everything directly under `app/` that is not `_`-prefixed is a route. Screen
  sub-components live in an `_`-prefixed subtree (e.g. `app/_Tabs/…`) so they
  never become routes.
- Route files stay **thin**: read params, pick the layout variant, own the
  header, delegate everything else to `src/`.
- Deep links (invite links, auth callbacks) are declared in `app.config.ts`.
  Adding a link-reachable screen means touching both files in one commit.

## `_layout.tsx` — the provider stack

The root `app/_layout.tsx` is the **only** place providers are mounted. Order is
load-bearing; keep it, and do not re-mount any of these deeper in the tree:

1. `GestureHandlerRootView` — outermost, must wrap everything.
2. The Convex client provider (`ConvexReactClient` created once at module scope
   with `unsavedChangesWarning: false`) plus the Convex Auth provider — nothing
   that calls `useQuery` / `useMutation` may render outside it.
3. The query-cache provider from `convex-helpers` — inside the Convex provider,
   outside the screens.
4. `CpkProvider` (theme) — everything using `useCPK()`, kstyled theme
   interpolation or theme tokens must be inside it.
5. Error boundary, then the action-sheet provider, then `<Stack>`.

The auth gate sits inside this layout: unauthenticated users are redirected out
of protected routes from one place, not from individual screens.

## Responsive: Mobile / Tablet split

- The breakpoint is `useTabletLayout()` from `~/hooks/useTabletLayout`: the
  window's **minimum dimension >= 600dp**. It is a window measure, not a device
  measure, so a 600dp Android portrait tablet and a resized/split-screen tablet
  window both resolve correctly, and the same branch works on web.
  **Never branch on `isMobile`** — it is `minWidth: 0` and therefore always
  `true`. Do not reintroduce `media.isTablet` or `Platform.isPad` here: cpk-ui's
  `isTablet` is a desktop-width media query and `isPad` ignores the actual
  window, so both misclassify split-screen and Android portrait tablets. The
  only correct branch is `useTabletLayout() ? <Tablet/> : <Mobile/>`.
- The route file picks the variant; the variants live under `app/_Tabs/<Tab>/`
  as `<Name>Mobile.tsx` / `<Name>Tablet.tsx`.
- Prefer the cheap tiers: a tablet file that only adds a centered max-width
  wrapper, or a two-line re-export of the mobile file when no tablet design
  exists yet. Fully duplicating a screen is a last resort — it drifts.
- Both variants take the same props object, computed once in the container.

## Lists

Every screen list backed by server data is `FlashList` + `usePaginatedQuery` +
`onEndReached`. `ScrollView` is only for forms, detail pages and fixed-size
content. See `../AGENTS.md` → List & Pagination Rules.
