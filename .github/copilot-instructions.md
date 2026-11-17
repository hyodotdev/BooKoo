# GitHub Copilot Instructions — BooKoo

BooKoo is a shared ledger (가계부) app: Expo SDK 57 + React Native 0.86 +
expo-router on the client, Convex on the backend, cpk-ui + kstyled for UI.

**The full instructions live in [`AGENTS.md`](../AGENTS.md) and
[`CONVENTION.md`](../CONVENTION.md). Read those first — this file only repeats
the rules that must never be broken in a suggestion.**

## Hard rules

1. **Paginate every unbounded list.** Any list that can grow without bound
   (ledger items, comments, members, notifications) uses
   `@shopify/flash-list` + Convex pagination — `paginationOptsValidator` on the
   server, `usePaginatedQuery` on the client. Never `ScrollView` + `.map()`,
   never `.collect()` on a growing table, never aggregate a whole table on the
   client.
2. **`any` is banned.** `@typescript-eslint/no-explicit-any` is `error`. No
   `as any`, no `@ts-ignore`. Type the thing, or use `unknown` + a narrowing
   check.
3. **Routes are typed.** `experiments.typedRoutes` is on. Fix the route or the
   params — never cast a route string with `as any`.
4. **i18n keys are static.** Always `t('ledger.title')` with a literal key that
   exists in `assets/langs/*.json`. Never `t(someVariable as any)`.
5. **Money is integer minor units** (KRW `1000` = ₩1,000). Never a float.
   Dates/times use one convention repo-wide — see `CONVENTION.md`.
6. **Convex queries use `withIndex`.** No `.filter()` scans on large tables.

## Style essentials

- TypeScript everywhere, explicit return types on exported functions, named
  exports for utilities, default export for screen/components.
- Styling is [`kstyled`](https://github.com/niceplugin/kstyled), **not**
  emotion: `styled.View` for static styles, ` css` `` in the `style` prop for
  dynamic ones. Never pass props into a styled component.
- Theme comes from `useCPK()` (cpk-ui). Never `useColorScheme()`.
- Components come from `cpk-ui` (`Typography`, `Button`, `Icon`) before any
  hand-rolled equivalent.
- Files: `PascalCase.tsx` components, `camelCase.ts` utils, route files follow
  expo-router naming.
- Commits are Angular Conventional Commits: `feat(ledger): add split entry`.

## Before proposing a change as done

```bash
bun lint:all && bun typecheck && bun run test
```
