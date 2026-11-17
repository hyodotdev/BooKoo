# Coding Conventions — BooKoo

The rules this repo is actually held to. [`AGENTS.md`](./AGENTS.md) is the
short version for AI agents; this is the long version for everyone.

Stack in one line: **Expo SDK 57 + expo-router (typed) + Convex + cpk-ui +
kstyled + zustand/MMKV + FlashList, TypeScript, bun.**

## Table of contents

1. [Hard rules](#1-hard-rules)
2. [TypeScript](#2-typescript)
3. [Repo layout and file naming](#3-repo-layout-and-file-naming)
4. [Convex (backend)](#4-convex-backend)
5. [Lists and pagination](#5-lists-and-pagination)
6. [Money, dates and units](#6-money-dates-and-units)
7. [Routing (expo-router)](#7-routing-expo-router)
8. [UI: cpk-ui](#8-ui-cpk-ui)
9. [Styling: kstyled](#9-styling-kstyled)
10. [Client state](#10-client-state)
11. [Internationalization](#11-internationalization)
12. [Errors](#12-errors)
13. [Tests](#13-tests)
14. [Git and commits](#14-git-and-commits)

---

## 1. Hard rules

These five are non-negotiable. A change that breaks one is wrong even if it
works.

1. **Every unbounded list is paginated.** FlashList on the client,
   `paginationOptsValidator` + `.paginate()` on the server. No
   `ScrollView` + `.map()` over user data, no `.collect()` on a table that
   grows, no client-side aggregation of a whole table. → [§5](#5-lists-and-pagination)
2. **`any` is banned.** `@typescript-eslint/no-explicit-any` is `'error'`. No
   `as any`, no `@ts-ignore`, no `@ts-expect-error` to dodge a real type.
   → [§2](#2-typescript)
3. **Typed routes, never cast.** `experiments.typedRoutes: true`. If a route
   string does not typecheck, the route file is missing or misnamed — fix that.
   → [§7](#7-routing-expo-router)
4. **i18n keys are static literals.** `t('ledger.title')`. Never
   `t(dynamicKey as any)`; branch with `if`/`switch` to reach a literal key.
   → [§11](#11-internationalization)
5. **Money is integer minor units, time is epoch milliseconds UTC.** No floats
   for money, one time convention everywhere. → [§6](#6-money-dates-and-units)

Before calling anything done:

```bash
bun lint:all && bun typecheck && bun run test
```

(`bun run test` — a bare `bun test` starts Bun's own runner, not jest.)

---

## 2. TypeScript

- TypeScript everywhere, `strict: true`. New `.js` files are not accepted.
- Explicit return types on exported functions and components
  (`: ReactElement`, `: Promise<void>`, …).
- **No `any`.** Reach for a concrete type, `unknown` + a narrowing guard, or a
  generic. Convex document ids are `Id<'ledgers'>` from
  `convex/_generated/dataModel` — never `string`.
- Prefer `type` aliases for object shapes; `interface` only when declaration
  merging is actually wanted.
- Named exports for utilities and hooks; default export for a screen or a
  component file.
- Import order: React / React Native → third-party → `cpk-ui` / `kstyled` →
  Convex (`convex/react`, `@convex/_generated/api`) → local (`~/...`,
  `@shared/...`) → assets.
- Path aliases (`tsconfig.json`): `~/*` → `src/*`, `@convex/*` → `convex/*`,
  `@shared/*` → `shared/*`. No `../../..` climbing out of a directory.
- Code shared by app and backend goes in `shared/` and must stay free of React
  Native and Convex imports.

---

## 3. Repo layout and file naming

```
app/            expo-router routes. Screens wire things together; no business logic.
convex/         schema, queries, mutations, actions, auth, lib helpers.
shared/         pure TypeScript shared by client and backend (money, dates, enums).
src/            components, hooks, stores, utils, theme, icons, STRINGS.
assets/         icons, images, fonts, langs/{ko,en}.json.
test/           jest setup + tests mirroring app/ and src/.
scripts/        repo scripts (see scripts/README.md).
```

| Kind                         | Convention                                                | Example                     |
| ---------------------------- | --------------------------------------------------------- | --------------------------- |
| Component / screen component | `PascalCase.tsx`                                          | `LedgerItemRow.tsx`         |
| Route file                   | expo-router naming                                        | `app/ledger/[ledgerId].tsx` |
| Hook                         | `useThing.ts`                                             | `useLedgerMembers.ts`       |
| Zustand store                | `useThingStore.ts`                                        | `useAppLockStore.ts`        |
| Util module                  | `camelCase.ts`, named exports                             | `formatMoney.ts`            |
| Convex module                | `camelCase.ts` under a domain dir                         | `convex/ledger/queries.ts`  |
| Constant                     | `UPPER_SNAKE_CASE`                                        | `PAGE_SIZE`                 |
| Asset export                 | `IC_` / `IMG_` / `FONT_` / `BG_` prefix in `src/icons.ts` | `IC_WALLET`                 |

One component per file. Styled components go at the **bottom** of the file,
types at the top, hooks at the top of the component body.

---

## 4. Convex (backend)

- **Schema** lives in `convex/schema.ts`, assembled from per-domain files. Every
  table that mirrors legacy data carries `legacyUid` / `legacyKey` so the
  migration stays idempotent and traceable.
- **Indexes before queries.** Every read uses `.withIndex(...)`. `.filter()` on
  a growing table is banned — add the index instead. Post-page filtering in JS
  is acceptable only for a predicate the index cannot express, and then the
  client must keep paging until `isDone`.
- **Permissions first.** The first statement of every query/mutation/action
  handler is a `convex/lib/permissions.ts` helper (`requireUser`,
  `requireLedgerMember`, …). No implicit trust in arguments.
- **Validators always.** `args` and (where practical) `returns` use `v.*`
  validators; paginated queries take `paginationOpts: paginationOptsValidator`.
- **Errors** are `ConvexError({code, message})`, mapped to user-facing copy by
  `src/utils/error.ts`. Never leak raw messages into the UI.
- **Soft delete** with `deletedAt`. Hard delete only pure join rows, orphaned
  blobs, and rows a documented retention purge removes once nothing restorable
  can reference them (the SCHEMA §5 purge cascade, the released archived CUSTOM
  category).
- **Aggregates** (monthly totals, per-category sums, balances) are maintained by
  rollup rows written inside the same mutation as the change, or by
  `@convex-dev/aggregate`. Never recomputed by scanning items.
- **Never edit `convex/_generated/**`.** It is produced by `bunx convex dev`
  (or `bunx convex dev --once`) and is gitignored.
- Mutations are the unit of consistency: a write and its rollup update belong in
  one mutation, not two round trips.

```ts
// convex/ledger/queries.ts
import {paginationOptsValidator} from 'convex/server';
import {v} from 'convex/values';

import {query} from '../_generated/server';
import {requireLedgerMember} from '../lib/permissions';

export const listItems = query({
  args: {
    ledgerId: v.id('ledgers'),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireLedgerMember(ctx, args.ledgerId);

    return await ctx.db
      .query('items')
      .withIndex('by_ledger_and_date', (q) => q.eq('ledgerId', args.ledgerId))
      .order('desc')
      .paginate(args.paginationOpts);
  },
});
```

---

## 5. Lists and pagination

The legacy app loaded every item of a ledger into Redux and got slower every
month. That failure mode is what this rule exists to prevent.

**Any list that can grow without bound** — ledger items, comments, members,
invitations, notifications, search results — uses:

```tsx
const PAGE_SIZE = 20;

const {results, status, loadMore} = usePaginatedQuery(
  api.ledger.queries.listItems,
  ledgerId ? {ledgerId} : 'skip',
  {initialNumItems: PAGE_SIZE},
);

return (
  <FlashList
    data={results}
    keyExtractor={(item) => item._id}
    renderItem={({item}) => <LedgerItemRow item={item} />}
    onEndReachedThreshold={0.5}
    onEndReached={() => {
      if (status === 'CanLoadMore') loadMore(PAGE_SIZE);
    }}
    ListEmptyComponent={<ListEmptyItem />}
  />
);
```

Banned for such lists: `ScrollView` + `array.map()`, `useQuery` of an entire
collection, `.collect()` without a bound, `FlatList` (use `FlashList`).

Allowed without pagination, and only these: a **fixed, small, non-user-generated**
set — category presets, settings rows, a static legal document. When you use a
`ScrollView` for one of those, say why in a comment right above it, the way
`app/privacy.tsx` does in FightingHows. Bounded reads of small catalogs use
`.take(N)` with a named constant, never an unbounded `.collect()`.

Also: no `useQuery` inside a list row. Fetch what a row needs in the page query
(serializers on the server), or the list becomes N+1 subscriptions.

---

## 6. Money, dates and units

**Money**

- Stored and passed around as **integer minor units** in the currency's own
  scale: KRW `1000` = ₩1,000 (KRW has no minor unit, so minor unit == won);
  USD `1099` = $10.99.
- Every amount travels with its `currency` code; never assume KRW downstream.
- No floating point arithmetic on money, anywhere. Sums are integer sums.
- Formatting for display happens in one place (`shared/money.ts`), never inline
  in a component.

**Dates and times**

- Stored as **epoch milliseconds, UTC** (`number`), same as Convex `_creationTime`.
- A ledger _entry date_ is additionally stored as a **local calendar day** in
  `YYYYMMDD` integer form (or an equivalent explicit day key) so month/day
  grouping and calendar queries never depend on the reader's timezone.
- All formatting and arithmetic uses `date-fns`. `moment` is gone and does not
  come back.
- Never build a date string by slicing an ISO string.

---

## 7. Routing (expo-router)

- Typed routes are on. `push('/ledger/[ledgerId]')` style APIs must typecheck
  without casts. A type error means a missing/misnamed route file.
- Destructure the router: `const {push, replace, back} = useRouter();`
- Use the native `Stack` header with `options`; do not hand-roll a header view.
  Header buttons are `Pressable` with `hitSlop`, no background, no radius.
- Screens read params with `useLocalSearchParams<{ledgerId: string}>()` and
  validate before use.
- Bottom-anchored UI uses `useSafeAreaInsets()`.
- Auth gating lives in `app/_layout.tsx`; screens do not each re-check session.

---

## 8. UI: cpk-ui

- Use cpk-ui components before writing your own: `Typography.*`, `Button`,
  `Icon`, `EditText`.
- **Text is `Typography.*`**, never React Native `Text`.
- **Theme is `useCPK()`**, never `useColorScheme()`:

```tsx
const {theme, themeType} = useCPK();
const isDark = themeType === 'dark';
```

- Colors come from theme tokens (`theme.bg.*`, `theme.text.*`, `theme.role.*`,
  `theme.button.*`) or `src/theme.ts`. No hardcoded hex in components.
- Dark mode and tablet are first-class: every screen must be checked in both
  themes, and wide layouts branch on the tablet flag rather than hardcoding
  phone widths.
- Margin on a cpk-ui component goes on `style`, not on `styles.container`.

---

## 9. Styling: kstyled

`kstyled` is compile-time CSS-in-JS. It is **not** emotion — do not copy emotion
patterns from older CPK projects.

```tsx
import {css, styled} from 'kstyled';
```

- **Static styles → `styled`**, at the bottom of the file:

```tsx
const Container = styled.View`
  flex: 1;
  padding: 16px;
  gap: 12px;
`;
```

- **Dynamic styles → ` css` `` in the `style` prop:**

```tsx
<View
  style={css`
    background-color: ${selected ? theme.role.primary : theme.bg.paper};
  `}
/>
```

- Keep the `css` import even when it looks unused in compiled output — the
  generated code references members on the `css` function object.
- Use transient props (`$active`) when a styled component genuinely needs a
  prop-driven value; do not thread state through props for what `css` can do.
- **Units:** a lone `${value}px` is fine. Anything else — `%`, multi-token
  values, computed insets — must return the complete string from inside the
  interpolation:

```tsx
padding-bottom: ${insets.bottom + 16 + 'px'};   // ✅
width: ${(p) => `${p.$pct}%`};                  // ✅
shadow-offset: ${x}px ${y}px;                   // ❌ becomes an invalid string
```

- `font-family` inside a template takes **no quotes**: `font-family: Pretendard-Bold;`
- Prefer `gap` over per-child margins.
- Group styles that depend on the same condition into one conditional block.

---

## 10. Client state

- **Server state is Convex.** `useQuery` / `usePaginatedQuery` / `useMutation`
  are the source of truth. Do not mirror server data into zustand.
- **zustand** holds UI/session state only (app-lock state, filters, drafts,
  theme override). Stores are `useThingStore.ts` with an explicit
  `initialState` and a `reset()`.
- **MMKV** is the persistence layer for cheap cold-start reads (last opened
  ledger, cached summary). Treat cached values as hints, never as truth.
- Mutations that change something the user is looking at should be optimistic
  where Convex makes it easy; correctness still comes from the server round trip.

---

## 11. Internationalization

- `i18n-js` with `assets/langs/ko.json` and `assets/langs/en.json`; Korean is
  the reference language.
- Import `t` from `src/STRINGS`. Keys are **static literals**, always.
- Key structure mirrors the route structure, plus a `common` namespace.
- Interpolation uses `%{name}`: `t('ledger.memberCount', {count})`.
- `bun lint:i18n` keeps the language files structurally identical — run it after
  touching either file.
- Never concatenate translated fragments to build a sentence.

---

## 12. Errors

- Backend throws `ConvexError({code, message})` with a stable `code`.
- `src/utils/error.ts` maps codes to i18n keys; the UI shows the mapped copy.
- Never render a raw error object or an English backend string to the user.
- User-visible failures get a toast or an inline message — not a silent catch.

---

## 13. Tests

- `jest` + `jest-expo` + `@testing-library/react-native`; setup in `test/`.
- Test files mirror the source path: `src/utils/money.ts` →
  `test/src/utils/money.test.ts`.
- Query by accessible role/text, not by internal structure.
- Convex hooks are mocked via `__mocks__/convex/react.tsx`; don't hit a real
  deployment from a unit test.
- Snapshots contain registered kstyled style ids, so assert with
  `StyleSheet.flatten(...)` rather than comparing style objects.
- Money and date helpers in `shared/` are pure — they get direct unit tests, and
  every new edge case found in review becomes one.

---

## 14. Git and commits

- Angular Conventional Commits, enforced by commitlint + husky:
  `<type>(<scope>): <subject>` — e.g. `feat(ledger): paginate item list`.
  Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`,
  `ci`, `chore`, `revert`.
- Branches: `feat/…`, `bugfix/…`, `docs/…`, `refactor/…`, `test/…`, `chore/…`.
  Never a tool or vendor prefix.
- Never commit directly to `main`.
- Never commit `.env*` (except `.env.example`), service-account keys, or
  anything under `BooKooLegacy/`.
- Keep a PR to one concern; unrelated cleanups go in their own commit.
- `bun check` (typecheck + lint + tests) before opening a PR.

---

## Checklist

- [ ] Unbounded list? FlashList + `usePaginatedQuery` + server `.paginate()`.
- [ ] Convex read uses `withIndex`, and a permissions helper runs first.
- [ ] No `any`, no `as any` on routes or i18n keys.
- [ ] Money is integer minor units; times are epoch ms UTC.
- [ ] `Typography.*` and `useCPK()`; no `Text`, no `useColorScheme()`.
- [ ] `styled` for static, ` css` `` for dynamic; units returned as full strings.
- [ ] Strings go through `t()` with literal keys, both `ko.json` and `en.json`.
- [ ] Checked in light and dark, phone and tablet.
- [ ] `bun lint:all && bun typecheck && bun run test` all pass.
