# DESIGN — App shell and screens (G22 closure)

**Status:** normative G22 acceptance contract, 2026-08-24. The complete route tree, legacy mapping,
screen/query tables, responsive examples, and component inventory live in `client-ia.md` and are an
implementation annex to this contract.

**Authority:** measured production facts in `research/15-REAL-DATA-PROFILE.md` → `SCHEMA.md` → this
document and `client-ia.md` → subsystem designs. If the two client documents drift, this acceptance
contract owns the required outcome and `client-ia.md` owns the detailed implementation shape. Every data
name, query bound, permission rule, date derivation, and write invariant still comes from `SCHEMA.md`.

**Scope:** closes G22. D3 is closed by `legacy-feature-contracts.md`; D4 by the privacy/release docs.
D6's `offline-and-caching.md`, `boot-and-providers.md`, `moderation-and-safety.md`, `observability.md`, and
`accessibility.md` now govern the corresponding cross-cutting screen states.

---

## 1. G22 is complete only when all of this is implemented

| Requirement from G22                    | Normative answer                                                                                                      | Detailed implementation                      |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Complete Expo Router tree               | 60 thin route files, protected route groups, deep-link entry points, non-route `_` component trees                    | `client-ia.md` §1                            |
| Every legacy route accounted for        | All 30 legacy routes map to a kept, collapsed, replaced, or explicitly removed surface; no silent drop                | `client-ia.md` §1.5                          |
| Navigation shell and ledger switch      | Four real tabs plus one add pseudo-tab; permanent tablet rail; active ledger header/sheet and full ledger manager     | §2 below; `client-ia.md` §2                  |
| Mobile/tablet split                     | `useTabletLayout()` (window min dimension >= 600dp) is the one structural breakpoint; route owns the branch           | §2.3; `client-ia.md` §4                      |
| Screen data ownership                   | Every route family names its query/subscription budget and pagination bound                                           | §3; `client-ia.md` §3                        |
| Loading/empty/gone/error/offline states | Contextual state compositions apply; every server write fails closed and stays retryable when disconnected            | §3.2; `offline-and-caching.md`               |
| Entry add/edit                          | One form owns type, minor-unit amount, category, ledger-zone date/time, memo, photos, save/retry, and edit deletion   | §4                                           |
| Item detail                             | Amount/category/time/place/photo/comment surfaces and four-subscription ceiling                                       | §3.1; `client-ia.md` §3.5                    |
| Stats/settings/photo/privacy ownership  | D3 owns feature behavior; D4 owns versioned legal surfaces, protected receipt media, exports, and store release gates | §3.1; `legacy-feature-contracts.md`; D4 docs |
| Optimistic updates                      | Never fabricate a Convex id; only actual queried/returned ids enter document caches and routes                        | §4.5; `client-ia.md` §7.7                    |

An implementation PR cannot claim G22 conformance by shipping placeholder routes. Each released route
must implement its table row, bounded data source, state matrix, permissions, and phone/tablet contract.
D4 is now closed: its privacy route, legal links, authenticated receipt renderer, and export surfaces are
required implementation work, not optional placeholders.

---

## 2. App shell contract

### 2.1 Root gates and route ownership

`app/_layout.tsx` mounts `boot-and-providers.md`'s complete provider stack once and owns the single auth state machine. The mutually
exclusive stages are signed-out, suspended, onboarding, locked, pending-deletion, and ready. Protected screens do
not redirect themselves. Public invite previews and public `/u/[handle]` profiles remain reachable
without mounting the ready app shell.

Profile path ownership is intentionally disjoint. `(onboarding)/profile.tsx` owns onboarding
`/profile`; the ready app owns signed-in My Profile at `/profile/me`; `/u/[handle]` is another user's
public card. The drawer and self deep links must resolve to `/profile/me`, and a self public-profile
lookup must redirect before Block/Report actions render. No ready-app `profile/index.tsx` may exist
because it would collide with the onboarding route.

Before those stages, `BootGate` handles only a **live** maintenance/minimum-native-build result and fails
open after 1,500 ms of unresolved config. OTA download/reload and the seven-day soft store nag follow the
same contract; stale cached config never bricks the app.

Route files stay thin: validate typed params, read `activeLedgerId`, select a phone/tablet variant, own
the route header, and delegate to `src/` or `_`-prefixed screen components. All navigation uses Expo
Router typed route literals with no `as any`. A deep-link route is incomplete until `app.config.ts` owns
its matching link declaration.

### 2.2 Ready shell

The ready shell exposes four navigation destinations: Calendar, Timeline, Stats, and Me. The centre add
button is a pseudo-tab: `tabPress` is prevented and
`/ledger/[ledgerId]/item/new` pushes a full-screen page without remounting the current tab. Back returns
to the preserved tab scroll, month, pagination, and selection state. Only `/entry/category` uses a
dimmed form-sheet presentation.

`activeLedgerId` is narrow Zustand state mirrored to the MMKV boot inventory. It is not a route segment
for the four tabs, so switching ledgers does not rebuild the navigation tree. Ledger-admin routes keep
`[ledgerId]` because they are deep-linkable and must not silently switch target when active state changes.

Every ledger-scoped header shows the ledger identity and a chevron. Tapping it opens one ledger-switch
sheet with unseen state, archived/received-invite affordances, create, and “manage all”. Selecting a
ledger updates `activeLedgerId` once; screen queries use `'skip'` until the id exists. The full `/ledgers`
route owns creation and administration, not the lightweight switcher.

### 2.3 Phone and tablet

The only structural branch is:

```tsx
const isTablet = useTabletLayout();
return isTablet ? <ScreenTablet {...props} /> : <ScreenMobile {...props} />;
```

`isMobile` is never used because cpk-ui defines it cumulatively from zero width. There is no second
breakpoint boolean in a custom hook and no `theme.isTablet` structural styling. `useLayoutMetrics()` may
derive gutters, reading width, split-pane width, orientation, and grid columns after reading the same
`useTabletLayout()` value. (Before 2026-09-09 this branch read `useCPK().media.isTablet`; that flag is a
desktop-width media query and misclassified 600dp Android portrait tablets.)

Phone uses bottom tabs, modal entry/edit surfaces, and push detail. Tablet uses an 88 pt leading rail and
split panes where selection context matters: Calendar day/list, Timeline list/detail, Stats chart/drill
down, members list/profile, and settings index/detail. Forms and leaf settings use the same component
state inside a centred maximum-width wrapper; tablet is not a separate business-logic implementation.

### 2.4 Header and motion

The legacy full-screen collapsing colour block becomes a compact ledger identity header. Ledger colour
is limited to identity surfaces; income/expense semantics always use theme money tokens. Collapse uses a
UI-thread Reanimated value tied to list scroll and respects Reduce Motion. Header geometry is stable
between skeleton and live states so a Convex update does not reflow the list.

---

## 3. Screen ownership and bounded subscriptions

### 3.1 Release screen budget

“Subscriptions” below are simultaneously mounted Convex query instances, including shared warm
sidecars. Pagination pages count individually. Every query also obeys its named `.take()` or pagination
constant from `SCHEMA.md`; these counts do not authorize an unbounded scan.

| Screen family         | Data owner                                                                   |                    Normal / hard ceiling | Phone / tablet outcome                                     |
| --------------------- | ---------------------------------------------------------------------------- | ---------------------------------------: | ---------------------------------------------------------- |
| Boot shell            | `users.me`, `appConfig.get`, `notifications.unreadCount`, `ledgers.listMine` |                                        4 | shell skeleton → cached/live shell; same providers on both |
| Calendar tab          | three visible month rollups, active-day items, category and roster sidecars  |                                        6 | month grid + day list / grid and persistent day pane       |
| Timeline tab          | paginated item page(s), month rollup, category and roster sidecars           | 7 normal / 21 at the explicit 8-page cap | list / list-detail split; past cap jumps by month          |
| Stats tab             | month and category rollups, sidecars, selected drill-down                    |                                        6 | charts + drill navigation / chart-detail split             |
| Me tab                | boot-warm profile/ledger/unread data plus handle state                       |                 no duplicate boot mounts | profile/settings list / index-detail split                 |
| Item detail           | item, ≤20 photos, paginated comments, ≤16 roster                             |                                        4 | pushed detail / selected detail pane                       |
| Entry create/edit     | categories + ledger; edit adds item                                          |            2 / 3 before upload mutations | modal / centred two-column form                            |
| Ledger members        | ≤200 members + ≤20 pending invites                                           |                                        2 | list + pushed actions / list-profile split                 |
| Ledger/admin leaves   | the exact `client-ia.md` §3.7 row                                            |                             row-specific | pushed leaf / centred or index-detail leaf                 |
| Search                | one debounced, paginated item search + warm sidecars                         |                                        3 | full screen / list-detail selection                        |
| Notifications         | one paginated inbox                                                          |                                        1 | full screen / centred list                                 |
| Public invite/profile | exact public preview/profile query                                           |                                        1 | public card / centred public card                          |

No screen adds per-row author, category, URL, or permission queries. Lists consume raw item pages plus
bounded sidecars; `coverPhotoId` addresses D4's authenticated media endpoint. Server-backed lists use FlashList,
stable callbacks, `getItemType` for heterogeneous rows, and `usePaginatedQuery` where the source is not a
named bounded sidecar.

### 3.2 One state model

Every screen-defining query implements all applicable states:

| State                        | Required UI                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `undefined`                  | geometry-matched skeleton; never a blank white view or global spinner           |
| `null` from a singular query | typed gone/unavailable state with a safe route out                              |
| empty list                   | product-specific explanation and one primary action; never the loading skeleton |
| recoverable error            | inline error boundary with Retry; existing content remains when safe            |
| forbidden                    | localized permission state; do not reveal mutation affordances first            |
| offline read                 | explicit connection-required state; never restore private server data from disk |
| offline write                | keep the draft, say a connection is required, and expose Retry; never enqueue   |

No server query result or mutation argument is persisted. Plaintext MMKV remains limited to
non-sensitive first-frame hints; credentials, app lock and pending-invite custody use their independent
SecureStore records. Component drafts and the current-session Convex cache are process-local.

### 3.3 D3 feature routes and the closed D4 privacy seam

`legacy-feature-contracts.md` now owns the D3 behavior on the G22 route seams:

- entry edit opens the system photo picker directly and caps selection at five; detail/editor previews open the full-screen `photo/[itemId]?index=&edit=` pager without an intermediate route;
- entry location selection is `entry/location` with current coordinates, address search, a draggable pin, and stored address plus coordinates; `place/view` remains the read-only detail route;
- category trend: `stats/category/[categoryKey]`; in-list/full search: `/search`;
- tutorial is a non-blocking auth-landing hero, not a new auth or MMKV gate;
- announcements/FAQ, default currency/language, and ADMIN operations are under `/settings`; shared
  accounting settings remain ledger admin;
- D4 adds `settings/privacy` for rights and personal export, keeps account deletion in
  `settings/account`, and places ADMIN+ ledger export in ledger settings. Terms/privacy links remain on
  sign-in/about. Every receipt renderer uses D4's authenticated media path; no bearer storage URL ships.

---

## 4. Entry add/edit is one complete interaction

### 4.1 Form and layout

`ledger/[ledgerId]/item/new.tsx` and
`ledger/[ledgerId]/item/[itemId]/edit.tsx` render the same typed `LedgerItemForm` state machine. Phone field
order is type segment, amount, category, date/time, memo, photos, migrated-place summary, and
save. Type is EXPENSE/INCOME (with schema-authorized correction/refund state), not two duplicated forms.
Category selection is one bounded ≤120-row form sheet; its Add cell is the first grid item. Create and
Edit themselves are pushed pages, share a back header, and Edit alone exposes confirmed deletion as a
top-right trash action.

Amount input is the custom integer minor-unit accumulator from `money-categories-i18n.md` §1.5. It never
parses a formatted display string and never invokes the OS numeric keyboard. Phone gives the keypad a
fixed lower panel that can collapse after amount entry; tablet places it beside the scrolling fields.
The primary save remains reachable above the safe area and keyboard.

### 4.2 Ledger-zone date and time

Use `@react-native-community/datetimepicker@9.1.0`, the Expo SDK 57 pin. The picker edits wall-clock
fields in the ledger's IANA timezone, not the device timezone. Submit converts those fields with shared
`wallClockToEpochMs`; the server remains authoritative and derives `dayKey`, `monthKey`, and
`occurredOffsetMinutes` again. A timezone maintenance lock disables save before the user taps it.

### 4.3 Persistence and validation

The unsaved form exists only in component state. Save calls `items.create` or `items.update` directly and
the authoritative mutation result is the earliest moment the UI may leave the form or say “저장됨.” A
process kill discards the draft. Local photo URIs and mutation arguments are never persisted; photo work
remains secondary after the real server item id exists.

Validation is inline and blocks amount zero, missing category, invalid wall-clock values, unsupported
currency state, lost membership, active maintenance and missing connectivity. A disconnected attempt
keeps the form intact and changes its primary action to Retry. The form does not use a full-screen spinner
or a success toast before the authoritative mutation returns.

### 4.4 Write and upload sequence

1. Validate locally, generate a `clientRequestId`, and submit `items.create` or `items.update` directly
   before any photo upload. An unchanged manual retry reuses that request id in
   memory; editing an argument creates a new id. Create returns the real item
   id; update carries `expectedUpdatedAt` and may enter conflict review.
2. Generate each selected image's max-1600 px JPEG q0.8 original and 320 px thumbnail on the client.
3. For each blob: call `files.generateUploadUrl`, POST it, receive `{storageId}`, immediately call
   `files.claimUpload`. The id cannot be claimed before POST because it does not exist.
4. Call `photos.attach` with one claimed original/thumbnail pair. It verifies ownership, resolves URLs
   once, inserts the photo, updates cover/count, and links both upload rows atomically.
5. Show per-tile progress. A failed tile does not roll back the item; Retry continues only that tile,
   Remove abandons it, and Done opens the already-saved item with an honest partial-success message.
6. Claimed/unattached blobs and POST-success/claim-crash blobs are collected by the two bounded orphan
   passes in `SCHEMA.md` §5.1/§7.5 after `UPLOAD_CLAIM_TTL_MS`.
7. Edit-mode removals call `photos.detach` only after the primary edit and successful new attaches, and
   only after explicit confirmation.

### 4.5 Render contract

The client never creates `crypto.randomUUID() as Id<...>` or any equivalent cast. Create does not add a
pending row or synthetic document id. The real row arrives with the id returned
by create and the live query; a failed request stays on the form as an
uncommitted draft.

The already-mounted month rollup may be optimistically replaced with a newly allocated value only when
the client derives the ledger-zone key through the same shared date module. Update/delete optimistic
layers operate only on real ids already returned by Convex. Photo upload progress stays local until
`photos.attach` succeeds.

---

## 5. Implementation acceptance checks

- Every route in the target tree is released with its data/state/layout contract; D3/D4 routes are no
  longer allowed to hide behind an open design owner, and no placeholder appears in navigation.
- Every legacy route row in `client-ia.md` §1.5 has one explicit outcome.
- Phone and tablet render tests prove the branch uses `useTabletLayout()` and shares the same container props.
- Query audit proves the §3.1 ceilings, named pagination bounds, `'skip'` guards, and absence of per-row
  queries or unbounded collections.
- Entry tests cover exponent-0/2/3 money, ledger timezone and DST boundaries, create/edit validation,
  primary-save-before-upload, POST-before-claim, per-tile retry, process interruption, and detach order.
- No fake Convex id cast, sensitive MMKV form draft, device-timezone calendar derivation, or pre-POST
  storage claim exists in code.
- `accessibility.md`'s dynamic-type/reflow, spoken money, chart alternative, touch/focus, Reduce Motion,
  contrast, PIN, phone/tablet and VoiceOver/TalkBack gates pass before I4 is marked done.

With this contract plus the detailed `client-ia.md` annex, the screen layer is owned and G22 is resolved.
