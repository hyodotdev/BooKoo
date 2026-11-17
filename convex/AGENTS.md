# Convex

Rules for this directory. Root rules still apply — see `../AGENTS.md`.

## Layout

- One table per file by default; the ten coupled multi-table units are frozen in
  `SCHEMA.md` §1.2. `schema.ts` does nothing but `defineSchema` over those
  imports. Enum validators are exported from their schema unit and reused in
  function `args`.
- Domain modules are plural: `<domain>/queries.ts`, `mutations.ts`, `actions.ts`.
- `lib/` holds ctx-taking and pure helpers; nothing in it is a Convex function.
- `_generated/**` is produced by the CLI. Never hand-edit it. I1 and later
  schema/API changes commit the regenerated output so CI can typecheck without
  deployment credentials. Verify a change with `bunx convex dev --once` only
  when the task is authorized to use the configured cloud deployment.
- Code shared with the app lives in `../shared/` and is imported **relatively**
  (`../../shared/x`). The `@shared/*` alias does not exist for the Convex
  bundler.

## Auth guard first

- The **first statement** of every handler is a sanctioned permission helper:
  account gates from `lib/permissions.ts`, or `requireLedgerMember` /
  `requireLedgerRole` from `lib/ledgerPermissions.ts` for ledger scope. Resolve
  the caller before any domain read or write.
- Ledger membership is an **O(1) indexed lookup** on the ledger-member join
  table. Never load a ledger's members and scan the array.
- Client-visible failures use only `lib/errors.ts#appError`, producing
  `ConvexError({code, messageKey, params})` from the closed vocabulary in
  `../shared/appErrors.ts`. Never throw a server-localized sentence. Expected
  business outcomes return a function-specific discriminated union when the
  current screen can exhaustively render every branch.

## Queries

- Every read starts with `.withIndex(...)`. **`.filter()` on an unbounded table
  is banned** — index the field, or filter a bounded page in JS after it comes
  back.
- `.collect()` is banned. Bounded reads use `.take(N + 1)` behind a named
  `*_SCAN_LIMIT` and reject the sentinel; unbounded reads use `.paginate()` with
  `paginationOptsValidator`.
- Every list is paginated. No exceptions for "it's small today".
- Index names are mechanically `by_` + fields joined with `_`, for example
  `by_ledgerId_deletedAt_dayKey_occurredAt`; fields stay in tuple order and
  camelCase is preserved. Put the soft-delete discriminator
  *inside* the list index so paged reads never come back short.
- `ctx.db.get('table', id)` — the two-arg form. The one-arg form is deprecated.
- No `Date.now()` inside a query. Pass `monthKey` / `dayKey` as arguments.
- Never call `storage.getUrl` per row in a list query. Receipt documents keep
  private storage ids and use the authenticated media action; only public
  avatars may keep a denormalized URL.

## Mutations

- All mutations go through the triggers-wrapped `customMutation`. Raw `mutation`
  is imported in exactly one file — the one that defines the wrapper.
- Deletion is soft: set `deletedAt` (epoch ms). Hard delete only pure join rows,
  orphaned blobs, and rows a documented retention purge removes once nothing
  restorable can reference them (the SCHEMA §5 purge cascade, the released
  archived CUSTOM category).
- **Rollups are owned by the write path.** The mutation that changes an entry is
  the same mutation that adjusts the affected rollup rows, inside the same
  transaction. The repair cron verifies/recomputes drift from source; it is not
  permission for a mutation to omit its delta. No query recomputes a dashboard
  total from raw items. Hot-write counters live in rollup tables, not on the
  parent document.

Table and index inventory: `../.notes/design/SCHEMA.md` (frozen). Scale
checklist: `../.notes/research/13-convex-scale.md` §11. Do not invent table or
function names before `SCHEMA.md` lands.
