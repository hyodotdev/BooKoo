# BooKoo — Design reconciliation

## October 26 — receipt feedback outside the scrollable form

The owner's correction supersedes OCR errors shown only at the bottom of the
entry form. Use cpk-ui's existing global Snackbar for recognition exceptions,
no usable result and currency-only mismatch warnings. Keep form save/upload
errors in their existing flow; a failed scan does not change the draft or the
Done action. This changes feedback presentation only, retaining the on-device
OCR and explicit review/Apply contract.

## October 26 — no advertising gap before display

The owner's Android screenshot shows an empty area beneath root navigation.
This supersedes the August29 rule that expanded the advertising slot on load
success: LevelPlay `onAdLoaded` and `onAdDisplayed` are separate events. Keep
the outer slot collapsed until display confirmation, and collapse again on
load/display failure. Retain the mounted SDK child and bounded retry lifecycle.
A fitting filled view also survives rotation or slot growth without a new
request. The genuine bottom safe area remains exactly once; this does not move
ads into Monthly content, remove navigation protection, change consent, or weaken Pro
suppression. See `../qa/2026-10-26-empty-ad-footer.md` for source and verification
boundaries; a synthetic SDK event is not proof of live inventory delivery.

## October 1 — stable calendar action and optional description (R77–R78)

R77 refines R72/R76: date-selection feedback remains on the visible circle;
the unrelated Add entry action stays mounted during confirmed-empty day
queries. The server's bounded rollups distinguish known empty from unknown
or populated dates, so the correction does not retain stale financial rows.

R78 removes the creation form's extra nonblank-description requirement.
The persisted schema still requires a string and accepts `''`, as recorded
in the original schema reconciliation. The input is optional; the stored
field is not nullable. No backend migration or API change is needed.

## October 1 — compact member actions (R75)

R75 extends R70's supporting-screen polish: the native member swipe reveal
split “administrator” inside the word. English role-action copy is shortened
without changing permissions, swipe geometry or the explanatory confirmation.
The confirmed native before/after is retained in the October1 acceptance run.

## October 1 — readable calendar motion (R74)

R74 extends R72/R73: an animated, round selection is insufficient if native
auto-fit hides its numeral, month title or tab names at large text. The selected
mark and short labels use natural measurement with the existing scaling cap;
this does not change the approved main/create composition or mandate global
font-size changes. The native iPhone failure and after replay are in the
October1 acceptance report. The domain entry dot also retains a fixed inset
inside the circle when its date line grows.

## R73 — selection ink fits at the spring peak (2026-10-01)

The owner's calendar-pop request exposes a large-text edge case: a circle
sized from tall cells exceeds the actual seven-column width and clips its
sides. Measured column width, including the 1.12 selection peak, now bounds
default and custom day marks through cpk-ui. This extends R72 without changing
the approved calendar rows, labels or target geometry. Native font-scale2
before/after evidence is retained in the October1 report.

## R70 — purposeful detail composition and selection motion (2026-09-30)

The owner identifies generic-looking secondary pages, especially Invite people,
and authorizes redesigning them. This supersedes the generic invitation hero
composition while preserving the public preview, role, pending-code and consent
contracts. Main and ledger creation geometry remain approved. Add small causal
selection feedback through cpk-ui; no perpetual decoration, tab entrance or
background-query animation. System reduced motion and interruption are required.


## September 20 — community positioning supersedes couples-only framing

The owner corrected the audience: BooKoo is a transparent community ledger for
company teams, global projects, hiking clubs, family trips, and other groups
sharing money. Couples remain a use case. This supersedes the household-only
Product read in `visual-language-2026.md`, the narrower audience wording in
R61–R63, and the September 17–19 store-positioning direction as future product
guidance. Historical release records remain evidence of what was published.

The household wording in `docs/release/SHIPATON_2026.md` and
`docs/product/MONETIZATION.md` must not override this audience decision. Their
existing prices, Free/Pro capacities, membership permissions, and deferred
Community tier remain the implemented contract until separately changed.
Product direction does not establish public ledgers, enterprise accounting,
currency conversion, or larger member limits. Public copy and submission assets
have not been changed by this local decision record.

## R69 — sign-in placeholders must not clip (2026-09-16)

The owner reported the email sign-in placeholder wrapping onto two lines with
the second line clipped. The cause is cpk-ui `EditText` omitting a native line
box (no `lineHeight`, interpolated axis `padding` after `padding-top`, Android
`includeFontPadding`) plus auth putting the OTP sentence in the placeholder.
This extends the amount-field line-box rule to sign-in without disabling font
scaling. Instructional copy moves to the login subtitle; the field keeps a
short placeholder and a two-line scaled `minHeight`.

## R66–R68 — reference add row and explicit sign-in progress (2026-09-13)

The new device photo reopens filled-button feedback: a 24dp margin on the
inner first-ledger Button creates a ripple above the painted capsule. Move
layout spacing outside the touch surface. The supplied drawer reference
supersedes R61–R63's filled Add ledger row: restore the separate subtle plus
tile and unfilled label row. Keep one accessible selection target.

Social loading must be visible from the first tap through session exchange,
including Kakao/Naver icon spinners, disabled competing actions and a
localized overlay after the provider returns. Native provider sheets retain
presentation ownership; errors and cancellation restore retry.

## R65 — eight scenes without changing the approved style (2026-09-13)

The user approved the first four-panel visual treatment, then requested iOS-like
coverage. The final Play gallery has eight feature scenes in the same order as
iOS: calendar, timeline, statistics, switching, sharing, categories, entry and
dark appearance. This supersedes the four-scene count in the initial September
13 report, not its restrained visual style or native-source requirement.


## R64 — direct-entry Back is a working exit (2026-09-13)

The user reported the GO_BACK warning during the ledger-create audit. A direct
launch has no previous stack entry. Ledger creation now dismisses the keyboard
and uses `/ledgers` when it cannot pop; email/OTP forms fall back to their owning
sign-in step. This supersedes unconditional `router.back()` in those forms.
The warning must be fixed at navigation ownership, not suppressed in LogBox.

## R61–R63 — compact Android and coherent store presentation (2026-09-13)

The user's September 13 references supersede the oversized sign-in gaps and
R15's 22sp tutorial action label, while preserving readable, scalable text and
48dp Android targets. A flow footer consumes the actual bottom inset; the
previous absolute `bottom: 28` could ignore SafeAreaView padding. cpk-ui owns
bounded Material ripples for buttons and circular feedback for bare icons.
Kakao/Naver's colour and press geometry must coincide.
**Superseded by R67:** this round temporarily replaced the separate plus
tile with a filled Add ledger row. The later supplied design restores the
unfilled row with its own subtle plus tile.

The August 29 single-action bar rule remains valid for other forms, but ledger
creation now explicitly uses the reference's bottom-right white pill. This
exception does not alter entry Save or selection Apply bars.

For store screenshots, the user rejects the mixed raw eight-screen gallery.
A uniform mint/navy palette, short benefit copy and consistent device frames
replace that upload selection and the older varied decorative backgrounds.
Actual native UI remains authoritative. Store metadata must use BooKoo (부쿠),
describe shared household expenses naturally, and reflect the real Free/Pro
contract. Search ranking is not a promised consequence of copy changes.

## R57 — accessibility QA does not change the design baseline (2026-09-09)

The user noticed the whole Pixel UI becoming larger while watching scrcpy;
the cause was our temporary system font scale1.5, not an app theme-size change.
They approved continued testing after the explanation. Evaluate baseline
proportions at the original scale. Announce any temporary device-wide font or
appearance change before applying it, keep the original value, and restore it
before handoff (including interrupted batches). Record large-text captures as
such, not as the default design. Never alter device density to compensate for
an app layout defect.

## R56 — category names stay compact (2026-09-09)

Category list names are a one-line exception to R54, with tail ellipsis and a
full accessibility label. Newly typed/pasted create and rename values cannot
contain whitespace (including tabs, newlines and Unicode spaces); share the
input normalization and server validation rule. Keep the existing 40-character
limit. Do not migrate or rewrite stored names or translated preset labels.
The full existing name remains available in its editor.

## R55 — intrinsic parallax title height (2026-09-09)

Expanded ledger titles use `numberOfLines={2}` and natural text wrapping, not
precomputed two-line height or line-count prediction. A one-line title must not
reserve a second line. Keep an 8pt toolbar-to-title gap and 14pt bottom inset.
Only measure the rendered content to synchronize the absolute parallax surface,
list top inset and collapse distance. Remeasure on title, width or font changes.
Sticky titles remain one line beside the menu with tail ellipsis.

## R54 — text overflow follows content purpose (2026-09-09, clarified)

The latest clarification rejects a global two-line cap. Choose by purpose:
navigation/sticky titles and compact metadata use one line; screen/card titles
and selectable names normally use up to two, with tail ellipsis where the full
value is available in a detail/edit surface. Comments, memos, invitation notes,
FAQ/announcement answers, instructions and legal/confirmation consequences are
readable in full. Do not truncate money, editable values or action labels to
make a layout fit: wrap/reflow the surrounding layout instead.

Reserve shrinkable width beside fixed actions and badges. Keep full accessible
names, but do not treat an accessibility label as a substitute for visible
body content. This supersedes the initial blanket titles/names rule and R51's
unrestricted heading wrapping, not its intrinsic-height requirement. Shared
Typography and cpk-ui primitives must not impose a global line limit.

## R53 — direct category reordering and contextual copy (2026-09-09)

The user rejects the expanded category editor's Move up/Move down/Hide button
cluster. Reorder through a visible drag handle and drag/drop, owned by cpk-ui;
provide equivalent assistive actions without restoring visual move buttons.
Remove Hide from this management UI, but do not silently unhide stored data.
Use Archive as the visible action; the confirmation must still identify the
affected category. Keep Expense/Income context once in the selector, not in
every row. Name/Add/Save and other contextual verbs replace repeated entity
nouns where their target is already clear. Preserve essential consequences,
permissions, bounded queries, stable keys and durable order after navigation.

## R52 — native detail-header inset ownership (2026-09-09)

The user again reported a header-height blank region under Android Members.
This reopens the August29 native-header acceptance: SettingsPage already
avoids a full-screen wrapper, but AppScreen-based ledger details still add the
window top inset after the native header has consumed it. AppScreen now reads
the router's public HeaderShownContext. Visible headers own that top inset;
headerless/custom-parallax screens retain it, and explicit sheet overrides
remain. Cover both SafeAreaView and colored-spacer branches. Do not compensate
each page with negative margins or change list pagination. New exact-artifact
native checks, not earlier captures, establish the corrected spacing.

The user rejected the first gap-free Members result as too tight: removing
the duplicate 66pt left only an 8pt list inset. Set a deliberate 20pt content
start, consistently across detail-frame families, without reinstating safe
area. Align the member ledger heading and Invite action, allow two title lines,
and keep the search field visually distinct. The callback/API fix and a test
PASS do not substitute for evaluating the complete screen composition.

The final large-text replay exposed a second issue: member names occupied the
badge regions. Give identity/name content an explicit shrinkable width and
keep You/role badges separate. Final Pixel Light1.0/Dark1.5 evidence verifies
both the spacing and the name/badge fix; earlier normal-font frames cannot
prove large-text acceptance.

## R51 — intrinsic confirmation title height (2026-09-09)

Same-day follow-up: the user rejected the merely uncollapsed horizontal trial
as crowded and supplied the original vertical ownership-dialog reference.
Restore generous padding, badge above the heading, readable explanation and
trailing actions. They explicitly require cpk-ui render functions for header,
body and actions; add those upstream with legacy API compatibility. The dark
white-veil defect and overridden action sizing are upstream issues, unlike
the original zero-height caller root. Both must be verified, not hidden by
one-screen padding or a local copy of the dialog primitive.

The physical Pixel10 screenshot reopens the August30 confirmation visual pass
for the current implementation. BooKoo supplied a `flex: 1` title root inside
cpk-ui's vertical title-slot wrapper; native layout collapsed that root to zero
height, hiding the title and painting the icon across the card/body boundary.
Keep the root intrinsic and non-shrinking; allow full heading wrapping and keep
the icon non-shrinking. Continue using cpk-ui's existing public AlertDialog;
do not fork the primitive to correct caller misuse.
The shared fix applies to every confirmation consumer, not only Account.
Earlier captures are historical; current replay is recorded in
`../qa/loop-ui/2026-09-09-dialogs.md`.

## September 6 — shared review fixtures and live locale

The latest user correction replaces one shared test login with two separate
synthetic Apple/Android identities. Each owns one sample ledger and accepts the
other's targeted invitation as MEMBER. This is not an admin account, Pro grant,
universal production OTP or permission to alter real ledgers. Keep credentials
out of tracked examples and screenshots.

Root-only locale subscription was insufficient for retained/memoized UI.
Formatting consumers now subscribe explicitly while preserving the existing
save/pop ordering and navigator identity. Do not restore locale-key remounts.
An embedded comment composer also must reserve actual scene/keyboard overlap;
the previous full-height sticky translation is not valid above a tab/ad footer.

## September 6 — truthful loading and filtered content pages

The latest request for centred Stats/route loading supersedes the older
80-point/upward-biased waiting composition below. Centre the shared indicator
and short copy in the available scene; no per-page offset. The visual-language
guide now agrees with the already-verified centred implementation.

FAQ/Announcements may filter unpublished or expired rows after a bounded
indexed page read. A zero-visible-row page is not the end of the list. Continue
that requested page chain until visibility or exhaustion, with a single loading
state; stop automatic advancement when rows arrive. This preserves pagination
and prevents false empty screens without reinstating whole-collection queries.

## September 6 — approved iOS Maps support floor

The user explicitly approved raising the minimum iOS version from 16.4 to 17.0.
This matches Expo Maps' native view availability; no unsupported map screen is
advertised for iOS 16. The later initial-release version decision keeps the
unreleased candidate at 1.0.0, with increasing native build numbers. See
`release-and-store.md` for the same-version native/OTA compatibility guard.
This is not an OTA or a force-update requirement.

## September 6 — photo-limit compatibility

The requested five-photo limit applies to new attachments. Applying it to
`photos.listByItem` also rejected previously valid 6–20-photo entries, so reads
retain the historical 20-photo bound with an overflow sentinel. Uploads remain
limited to five. No existing photo is deleted or silently omitted. This is
data compatibility, not a second upload limit or a return of the legacy UI.


Status: **normative for reconciled gaps**. This document records how contradictions were resolved; it
does not replace the complete table definitions in `SCHEMA.md`.

Authority order:

1. `.notes/research/15-REAL-DATA-PROFILE.md` when it contains a measured production fact.
2. `.notes/design/SCHEMA.md` for every schema, field, table, and index decision.
3. Subsystem design documents for flows and rationale that do not contradict 1 or 2.

The real-data profile contains no measured fact that changes the G1–G5 naming decisions below, so
`SCHEMA.md` is authoritative for this pass.

## September 6 — inline information accordions

The latest correction supersedes the earlier announcement-detail design.
FAQ and Announcements use the public cpk-ui Accordion, with inline animated
expansion and no separate detail route or dedicated single-item query. Both
share 16-point outer gutters and use the remaining available width, including
tablet landscape. Other settings retain their existing readable-width cap.
Pagination remains FlashList plus indexed Convex pages; an accordion is a row,
not a reason to fetch the whole content collection.

## September 6 — native appearance and Paywall publication

The user explicitly approved publishing checked Paywall draft 28 without price changes.
Revision 28 is now published on the existing current `pro` Offering; older notes preserving
published 8 are historical. Native acceptance is separate from publication and commerce.
The physical iPad exposed a theme gap: CPK Dark styled the app but not the native Paywall.
Synchronize the saved app preference with native Appearance; System releases the override.
Changing only React colours or the window background is not dark-mode parity.

## R1 — G1–G5 resolved (2026-08-24)

### G1 — verified email authority

`userEmails` is a permanent application table in the normative `convex/schema.ts` design in
`SCHEMA.md`. The designed schema therefore has **34 application tables + 7 Convex Auth tables**, with
30 permanent application tables after migration staging is removed.

Normative shape: `SCHEMA.md` §3.1.1.

- Fields: `userId`, `emailNormalized`, `emailRaw`, `verifiedAt`, `source`, `isPrimary`, plus the shared
  timestamp, soft-delete, and legacy fields.
- `source` is one of `OTP | GOOGLE | APPLE | KAKAO | LINK`.
- Live-address exclusivity uses `by_emailNormalized_deletedAt`.
- A user's proved-address list uses `by_userId_deletedAt` and is bounded to 10 rows.
- `by_legacyKey` is present from the first schema version.
- `userEmails` is the authority for every proved address. `users.email` and
  `userProfiles.emailNormalized` are denormalized mirrors of the primary address.
- Only `setPrimaryEmail` and `applyEmailLink` may change the primary row or either mirror, in one
  mutation. `PRIMARY_EMAIL_MIRROR_CHECK` verifies the invariant nightly and alerts on drift.

An unverified provider address is never inserted. A legacy address becomes a `userEmails` row only
after the user proves control of it; the migration staging row alone is not proof.

### G2 — one `userProfiles` schema and insert path

`SCHEMA.md` §3.1 is the only `userProfiles` definition. `auth-onboarding.md` no longer carries duplicate
definitions of `userProfiles`, `userHandles`, auth-support, or migration tables.

Every new profile insert goes through `newUserProfileDefaults` in `convex/lib/userProfiles.ts`, returning
`Omit<Doc<'userProfiles'>, '_id' | '_creationTime'>`. It must provide every required schema field, use
uppercase `SYSTEM | LIGHT | DARK`, use `preferredCurrency`, and import the shared `DEFAULT_LOCALE`
(currently `en`) plus that locale's currency/timezone/week-start fallback. This makes a newly required
schema field a compile-time failure in one place rather than a runtime validation error in an auth
callback.

The root subscription and onboarding mutation also expose/write `preferredCurrency`; the discarded
`defaultCurrency` name is not part of the model.

### G3 — canonical table and ledger-field names

| Discarded name                                         | Normative answer                                                                          |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `entries`                                              | `ledgerItems`                                                                             |
| `entryComments`                                        | `itemComments`                                                                            |
| `entryPhotos`                                          | `itemPhotos`                                                                              |
| `dailyRollups`                                         | `ledgerDayRollups`                                                                        |
| one `monthlyRollups` table with optional `categoryKey` | `ledgerMonthRollups` plus `ledgerCategoryMonthRollups`                                    |
| `migrationIssues`                                      | `migrationAnomalies`                                                                      |
| separate `announcements` and `faqs`                    | `appAnnouncements`, distinguished by `kind: NOTICE \| FAQ`                                |
| `ledgers.currency`                                     | `ledgers.baseCurrency`                                                                    |
| `ledgerStats`                                          | no table; use the indexed item probes and bounded month-rollup ranges in `SCHEMA.md` §4.3 |

The three rollup tables remain separate because calendar, month-total, donut, and category-trend reads
need incompatible index field orders. `money-categories-i18n.md` and `calendar-component.md` now point to
the normative rollup schema instead of defining alternate tables.

### G4 — sharing fields

`sharing-invites.md` owns the invitation and membership flows, but its §5.1–§5.6 table blocks are only
pointers to `SCHEMA.md` §3.5–§3.8. The exact field mapping is:

| Discarded field                | Normative field                                | Table                |
| ------------------------------ | ---------------------------------------------- | -------------------- |
| `removedAt`                    | `deletedAt`                                    | `ledgerMembers`      |
| `removedBy`                    | `deletedByUserId`                              | `ledgerMembers`      |
| implicit removal meaning       | `endReason: LEFT \| REMOVED \| LEDGER_DELETED` | `ledgerMembers`      |
| `invitedBy`                    | `invitedByUserId`                              | `ledgerMembers`      |
| `createdBy`                    | `createdByUserId`                              | `ledgerInvites`      |
| `revokedBy`                    | `revokedByUserId`                              | `ledgerInvites`      |
| `inviteeEmail` on a stored row | `inviteeEmailNormalized`                       | `ledgerInvites`      |
| `decidedBy`                    | `decidedByUserId`                              | `ledgerJoinRequests` |
| `actorId`                      | `actorUserId`                                  | `ledgerAuditLog`     |
| `at`                           | `createdAt`                                    | `ledgerAuditLog`     |
| numeric `color`                | token `colorKey`                               | `ledgers`            |
| `currency`                     | `baseCurrency`                                 | `ledgers`            |
| optional `description`         | required `description` (`''` is valid)         | `ledgers`            |
| `createdBy`                    | `authorId`                                     | `ledgerItems`        |

The public invite-create argument may still be named `inviteeEmail`: it is raw user input. The server
normalizes it before writing `inviteeEmailNormalized`; no stored schema field uses the raw-input name.

### G5 — one index grammar

Every application index name is mechanically derived from its exact field tuple:

```text
indexName = "by_" + fields.join("_")
```

No `_and_` separators and no abbreviated field names are allowed. Search indexes use
`search_<field>`. R5 must leave `scripts/lint-schema.ts` check 1 internally consistent; I1 then delivers
that check with the first schema files so the grammar is enforced from their first commit.

Auth mapping:

| Discarded                           | Normative                       |
| ----------------------------------- | ------------------------------- |
| `by_emailNormalized_and_deletedAt`  | `by_emailNormalized_deletedAt`  |
| `by_userId_and_deletedAt`           | `by_userId_deletedAt`           |
| `by_userId_and_releasedAt`          | `by_userId_releasedAt`          |
| `by_userId_and_clientId`            | `by_userId_clientId`            |
| `by_emailNormalized_and_claimState` | `by_emailNormalized_claimState` |
| `by_userId_and_createdAt`           | `by_userId_createdAt`           |
| `by_event_and_createdAt`            | `by_event_createdAt`            |

Sharing mapping:

| Discarded                                                               | Normative                             |
| ----------------------------------------------------------------------- | ------------------------------------- |
| `by_owner_and_deleted`                                                  | `by_ownerId_deletedAt`                |
| `by_ledger_and_user`                                                    | `by_ledgerId_userId`                  |
| `by_user_and_removed`                                                   | `by_userId_deletedAt`                 |
| `by_ledger_and_removed_and_joinedAt` / `by_ledger_and_removed_and_role` | `by_ledgerId_deletedAt_role`          |
| `by_invite` on membership                                               | `by_joinedViaInviteId`                |
| `by_ledger_and_revoked`                                                 | `by_ledgerId_revokedAt_createdAt`     |
| `by_inviteeEmail_and_revoked`                                           | `by_inviteeEmailNormalized_revokedAt` |
| `by_inviteeUserId_and_revoked`                                          | `by_inviteeUserId_revokedAt`          |
| `by_invite_and_user`                                                    | `by_inviteId_userId`                  |
| `by_invite` on redemption                                               | `by_inviteId_redeemedAt`              |
| `by_ledger_and_status`                                                  | `by_ledgerId_status_requestedAt`      |
| `by_user_and_status`                                                    | `by_userId_status`                    |
| `by_status_and_expiresAt`                                               | `by_status_expiresAt`                 |
| `by_ledger_and_target`                                                  | `by_ledgerId_targetUserId_createdAt`  |

The old joined-time membership index was not merely renamed: it was removed by the authoritative schema.
Roster/fan-out reads use the bounded `by_ledgerId_deletedAt_role` range. Any display ordering not encoded
by that tuple is performed only after the bounded read; no undocumented index may be recreated.

## Files reconciled in R1

- `.notes/design/SCHEMA.md`
- `.notes/design/auth-onboarding.md`
- `.notes/design/sharing-invites.md`
- `.notes/design/money-categories-i18n.md`
- `.notes/design/calendar-component.md`
- `.notes/design/gaps.md`
- `.notes/design/RECONCILIATION.md`

R1 resolves only G1–G5. Currency semantics, migration type inference, timezone/calendar correctness,
bundle/deep-link rules, cron/rate-limit composition, schema-lint details, and dependency installation remain
owned by R2–R6 and must not be inferred from this entry.

## R2 — G6, G7, G15 resolved (2026-08-24)

### G6 — one base-currency rule

`SCHEMA.md` §7.3 is normative. `ledgers.baseCurrency` is the unit of every rollup and cannot be changed
after a non-deleted item exists, except for the migration-specific one-time confirmation below.

- A ledger with zero live items may change `baseCurrency` through `ledgers.update`; the mutation requires
  `OWNER` for that field and proves emptiness with the indexed `.first()` probe before patching.
- A migrated ledger with `currencyIsAssumed === true` may call `ledgers.confirmCurrency` exactly once.
  It sets `maintenanceLock: 'CURRENCY'`, schedules `CURRENCY_REBASE`, re-derives every migrated amount
  from `legacyRealAmount` at the confirmed exponent, then runs `ROLLUP_REBUILD` before unlocking.
- `confirmCurrency` writes `CURRENCY_CONFIRMED` and flips `currencyIsAssumed` to false. A second call is
  rejected. Relabelling stored integers without re-deriving them is forbidden because it creates a 100×
  error for currencies whose exponent differs from the migration's assumed KRW exponent.
- A populated, non-migrated ledger cannot change base currency in v1. Historical re-denomination is a v2
  seam gated by an explicit deployment flag and the existing maintenance-job protocol.

The discarded `ledgers.setCurrency`, mixed-currency-history divider, and
`ledgers.baseCurrencyMigration` object are not part of the design.

### G7 — legacy item direction comes from measured sign

`.notes/research/15-REAL-DATA-PROFILE.md` overrides every older inference: among the 34,798 item rows
that contain a finite `realAmount`, 25,895 are negative, 8,903 are positive, and zero are zero. The one
remaining RTDB child is the measured ghost node that produces no ledger-item row.

The importer therefore applies exactly this rule:

```text
realAmount < 0  -> EXPENSE
realAmount > 0  -> INCOME
realAmount == 0 -> category.category == 1 ? INCOME : EXPENSE, plus ZERO_AMOUNT
```

`category.category` is only the zero-value fallback and an anomaly signal; it exists on just 1,090 of
34,799 source children. A disagreement never flips the item: sign wins and the importer writes
`AMOUNT_SIGN_CATEGORY_MISMATCH`. Likewise, the category selected by `iconId` keeps its own preset kind,
the item keeps the sign-derived type, and a disagreement writes `CATEGORY_KIND_CONFLICT`. The rollups
already carry separate expense and income totals per category, so both facts remain representable.

The migration verification suite must run over the local real export and assert exactly 25,895 imported
expenses, 8,903 imported incomes, zero zero-valued rows, and one archived ghost child. The real export
stays under `.local/` and is never committed or uploaded.

### G15 — cpk-ui icon names, no category assets

`category-icons.md` is authoritative for the 34 legacy-id mappings. BooKoo ships no category PNG or SVG
assets and no MaterialCommunityIcons category namespace. Every preset and custom category stores one
cpk-ui `IconName`; rendering is the existing `<Icon name={iconKey} />` path. The installed cpk-ui 0.8.0-beta.0
exports both `iconList` and its `IconName` union, and all 34 selected names were verified against it.

Category identities are deliberately two separate fields:

- `key`: the stable camelCase application slug (`meal`, `mobileFee`, `walletMoney`) and i18n suffix.
- `legacyStringKey`: the uppercase `STRINGS.js` key (`MEAL`, `MOBILE_FEE`, `WALLET_MONEY`) used only to
  build the migration's multilingual label lookup.

`SYSTEM_CATEGORIES` has the normative shape
`{key, kind, icon: IconName, colorToken, legacyIconId, legacyStringKey, sortOrder}`. Overlay rows retain
the schema field name `iconKey`, but its value is a raw cpk-ui `IconName`, not a `bk:`/`mci:` identifier.
The discarded SVG/SVGR pipeline, `legacyAsset`, `mciFallback`, `CUSTOM_ICON_POOL`, and icon dispatcher
must not be implemented.

## Files reconciled in R2

- `.notes/design/SCHEMA.md`
- `.notes/design/sharing-invites.md`
- `.notes/design/money-categories-i18n.md`
- `.notes/design/migration-plan.md`
- `.notes/design/client-ia.md`
- `.notes/design/category-icons.md`
- `.notes/design/gaps.md`
- `.notes/design/RECONCILIATION.md`

R2 resolves only G6, G7, and G15. Timezone/calendar correctness begins at R3; the remaining
reconciliation and dependency work remains owned by R3–R6.

## R3 — G8 and G9 resolved (2026-08-24)

### G8 — the ledger calendar owns every BooKoo date key

`SCHEMA.md` P6 and §7.2 are normative: `ledgers.timeZone` is the only timezone used to derive
`ledgerItems.dayKey`, `ledgerItems.monthKey`, rollup keys, the visible Calendar month, the selected
day, and the highlighted “today”. A member in another timezone sees the ledger's civil calendar, not
the device's calendar. `ledgers.weekStartsOn` is likewise passed explicitly so every member sees the
same columns.

cpk-ui's generic `<Calendar>` remains timezone-agnostic. Its `CalendarDateKey` (`yyyy-MM-dd`) and
`CalendarMonthKey` (`yyyy-MM`) are civil-date identifiers with no timezone of their own; all keys in
one render must belong to the same caller-defined calendar. A `Date` exposed by the component is a
local-noon interop view of a key, never an instant to persist. The key returned by `onChange` is the
authority.

`<LedgerCalendar>` therefore supplies only ledger-calendar strings:

- `month` and `value` come from ledger-calendar keys in `useCalendarStore`.
- `today` is `dayKeyToCalendarKey(toDayKey(now, ledger.timeZone))`, refreshed at the next midnight in
  that IANA zone and again when the app becomes active.
- `onChange` converts the string once with `calendarKeyToDayKey` at the Convex query boundary. Entry
  creation converts the chosen wall-clock fields with `wallClockToEpochMs(..., ledger.timeZone)`;
  clients still never author stored bucket keys.
- `weekStart={ledger.weekStartsOn}`; the old hard-coded Sunday value is discarded.

The device timezone is allowed only to suggest defaults when a ledger is created. It never changes an
existing ledger's grid, query arguments, totals, or selected-day list.

The OS calendar remains the first source for a new ledger's `weekStartsOn`. If it is unavailable,
the language-only fallback follows CLDR week data and cpk-ui's region resolver: `en`, `ko`, `ja`,
`zh` (CN), and `id` (ID) are all Sunday-first (`0`). The previous `zh`/`id` Monday fallback was a
document/code contradiction and could pre-fill a ledger differently from the calendar grid.

### G9 — one bounded, shard-safe calendar rollup read

The canonical marker query is the already-general `api.rollups.queries.daysInRange({ledgerId,
fromDayKey, toDayKey})`; the redundant `daysOfMonth` and `dayMarkers` names are retired. For Calendar,
the range is the union of the previous/current/next mounted grids and is capped at 126 civil days.
For Timeline, the same function is called with a loaded item page's at-most-30-day extent.

The function reads `ledgerDayRollups.by_ledgerId_dayKey_shard`, applies the named scan cap, groups by
`dayKey`, and sums **every shard** into one `{expenseMinor, incomeMinor, itemCount}` result. It never
returns raw shard rows and never `.eq()`s `shard`, so raising `ROLLUP_SHARD_COUNT` cannot create partial
day totals. Invalid or over-wide ranges fail before the indexed read instead of returning a truncated
calendar.

`<LedgerCalendar>` formats each net as
`formatMoney({amountMinor: incomeMinor - expenseMinor, currency: ledger.baseCurrency}, locale)`.
No exponent is hard-coded. The raw-rollup MMKV key includes the numeric range, ledger timezone, week
start, and base currency; the marker-identity key additionally includes the formatted label and full
palette. Changing the ledger calendar, currency, locale, or theme therefore cannot reuse stale labels
or markers.

## Files reconciled in R3

- `.notes/design/SCHEMA.md`
- `.notes/design/calendar-component.md`
- `.notes/design/client-ia.md`
- `.notes/design/money-categories-i18n.md`
- `.notes/design/gaps.md`
- `.notes/design/RECONCILIATION.md`

R3 resolves only G8 and G9. Bundle/deep-link, role, cron/rate-limit, membership-invariant,
schema-lint, migration-pass, push-fan-out, and dependency conflicts remain owned by R4–R6.

## R4 — G10 through G14 resolved (2026-08-24)

### G10 — one application identity and one invite-link shape

The shipped scaffold and `DECISIONS.md` are normative. BooKoo's native identifier is
`dev.hyo.bookoo` on both platforms. Sign in with Apple uses that value as the native audience and
`dev.hyo.bookoo.web` as the web Services ID. The canonical public invite URL is
`https://bookoo.hyo.dev/invite/<grouped-code>`; the internal expo-router route is
`/invite/[code]`, and the custom-scheme fallback is `bookoo://invite/<code>`.

The same `APP_DOMAIN`/`bookoo.hyo.dev` host is used by `ios.associatedDomains`, Android's verified
`intentFilters`, the AASA `/invite/*` rule, `assetlinks.json`, the landing-page HTTP action, and
`+native-intent.tsx`. The discarded native identifier `dev.hyo.bookoo` and public `/i` path are not
compatibility aliases: this is a new store identity and there is no released new-app link to preserve.

### G11 — four ranked roles and category guards

The only roles are `OWNER | ADMIN | MEMBER | VIEWER`. Every permission check uses
`requireLedgerRole(ctx, ledgerId, minimum)` with the rank order `VIEWER < MEMBER < ADMIN < OWNER`; array
guards and the nonexistent `EDITOR` role are invalid.

`categories.create` requires `MEMBER`. Its call to `materialize` means a MEMBER's first custom category
may create the preset overlay, intentionally. `categories.reorder`, `rename`, `setHidden`, and `archive`
require `ADMIN`, because they change the shared taxonomy or historical presentation. The category
function inventory and sharing permission matrix carry the same split.

### G12 — one eleven-job cron registry

`SCHEMA.md` §6.1 exclusively owns `convex/crons.ts`. Its union contains exactly eleven registrations:
hourly rollup repair; daily join-request expiry, counter repair, soft-delete purge, ledger purge, account
purge, invite expiry/use-count repair, audit purge, and stale-unverified-user purge; plus six-hour orphan
upload sweeping and fifteen-minute legacy-blob copying. Daily jobs occupy 16:00–23:00 UTC in that order.

`repairLedgerCounters` includes `MEMBER_COUNT_REPAIR`; `expireAndRepairUseCount` owns both invite expiry/GC
and `INVITE_USECOUNT_REPAIR`. Subsystem documents describe their handlers but do not register a second
cron list.

### G13 — one component and sixteen rate-limit buckets

`SCHEMA.md` §2.2 exclusively owns both the rate-limiter component mount and
`convex/lib/rateLimits.ts`. The exact design pin is `@convex-dev/rate-limiter@0.3.2`; R6 installs and
verifies it against this repo's Convex version. The single `RateLimiter` contains the nine auth buckets,
five sharing buckets, `feedbackSend`, and `reportCreate` — sixteen names total.

`checkHandleAvailability` remains an unlimited query: turning its one indexed read into a write-backed
counter would cost more than the probe. `handleClaim` and `handleRename` own the actual abuse budget.
Subsystem documents point to the merged definition and may show call sites, never another constructor.

### G14 — mutation-maintained membership invariants

Membership invariants do not use `ledgerMembers` triggers. Every membership mutation updates
`ledgers.memberCount` exactly once in the same transaction: create starts at one; invite redemption,
join-request approval, removal, leave, and bulk invite-member removal apply the exact live-row delta.
`MEMBER_COUNT_REPAIR` recomputes nightly. Migration P3 inserts raw membership rows and then patches the
exact per-ledger count, so it cannot double-count.

Ledger creation, ownership transfer, owner leave/account deletion, and any role mutation that could affect
ownership assert in the same transaction that one live `OWNER` membership exists and matches
`ledgers.ownerId`. `OWNER_INVARIANT_CHECK` repeats that assertion nightly and alerts without self-healing.
This decision is deliberately separate from the still-open rollup-trigger spike in `SCHEMA.md` §10.1.

## Files reconciled in R4

- `.notes/design/SCHEMA.md`
- `.notes/design/auth-onboarding.md`
- `.notes/design/sharing-invites.md`
- `.notes/design/money-categories-i18n.md`
- `.notes/design/client-ia.md`
- `.notes/design/gaps.md`
- `.notes/design/RECONCILIATION.md`

R4 resolves only G10–G14. Schema-lint, last-editor, migration-P10, push-fan-out, and dependency decisions
remain owned by R5–R6.

## R5 — G16 through G21 resolved (2026-08-24)

### G16 — the schema lint classifies intent instead of guessing it

`scripts/lint-schema.ts` checks application tables only; library-owned `authTables` are outside BooKoo's
index grammar. Every application index must be declared exactly once in a policy manifest as `lookup`,
`list`, or `maintenance`. The `deletedAt`-at-position-two rule applies only to tenant-scoped `list`
indexes on a soft-delete table. Lookup indexes such as `ledgerMembers.by_ledgerId_userId` and the
deliberately all-row maintenance index `ledgerItems.by_ledgerId_monthKey` remain legal and explicit.

Table lifecycle is likewise classified: standard mutable rows carry `createdAt` and `updatedAt`; append-only
rows carry `createdAt`; tables whose domain already has named lifecycle timestamps and derived/cursor rows
are explicit manifest classes with their own required fields. The eight user-visible soft-delete tables are
`userEmails`, `ledgers`, `ledgerMembers`,
`ledgerItems`, `itemPhotos`, `itemComments`, `notifications`, and `appAnnouncements`. Each uses the shared
`softDelete` spread. Any new table or index that is missing from the manifest fails the lint, so an
exception cannot appear as an unreviewed suppression.

### G17 — one last-editor field

`ledgerItems.updatedByUserId` is the only last-editor field. It is the last member to patch the row,
whatever field changed; `undefined` means the item has never been edited since creation. The discarded
`lastEditedByUserId` and `updatedBy` names do not exist. `ItemRow` includes `updatedAt` and
`updatedByUserId` so detail UI can render the editor without exposing migration fields.

### G18 — feedback is a reference-carrying mutation pass

P10 imports all 69 legacy opinions through `migrate.importFeedback` in batches of 300. Each row resolves
`legacyUid` through `userProfiles.by_legacyUid`; an unresolved or absent uid leaves optional
`feedback.userId` absent while preserving `legacyUid` and `legacyUserJson`. The explicit `createdAt` owns
ordering, so feedback `_creationTime` is the cutover instant and is never read.

Only the reference-free P0 staging file is a direct JSONL import. The reference-carrying rule explicitly
includes `feedback`, `ledgerJoinRequests`, `ledgerInvites`, and `ledgerMemberState` alongside items,
comments, photos, and memberships.

### G19 — the unseen query has an eight-ledger working set

The client derives at most eight pinned/recent, non-archived targets from the current switcher result and
passes `{ledgerId, lastReadAt}` explicitly to `ledgers.unseen`. The handler rejects duplicate/over-cap
input, checks the current user's live membership and current ledger lifecycle for every id, then compares
the newest live item with the supplied read watermark. A forged watermark can only alter the caller's own
dot; it cannot expose a row or bypass either server-side gate. An archived/deleted ledger returns no badge
even when a stale client argument arrives. The exact worst case is 25 documents (one profile plus eight
each of membership, ledger, and newest-item reads); it never fans out to all ledgers. Ledgers outside the
working set resolve lazily when the switcher opens.

### G20 — bounded, coalesced item pushes

`.notes/design/notifications-push.md` is normative. `items.create` schedules one internal action atomically
after its four domain writes. The post-commit workflow scans at most `PUSH_RECIPIENT_SCAN_LIMIT = 200`
member-state rows and at most `PUSH_DEVICE_LIMIT_PER_USER = 8` live tokens per eligible recipient. It
claims `ledgerMemberState.lastItemPushAt` in a mutation, so concurrent item actions produce at most one
item banner per `(ledger, recipient, 10 minutes)`; the actor, muted/disabled recipients, and recipient-local
quiet hours are skipped.

`push.registerToken` enforces the same device bound transactionally: registering a ninth live token disables
the least-recently-updated old token. The sender also reads at most nine and fails closed if corrupted data
somehow violates that invariant.

`ITEM_ADDED` is push-only and creates no `notifications` row. Its typed payload carries raw
`amountMinor` + `currency`, never formatted money; the action renders against each token's cached locale.
Expo batches are at most 100 messages. Ticket results schedule receipt checks after 15 minutes;
`DeviceNotRegistered` disables the exact token, and transient HTTP failures use bounded exponential retry.

### G21 — one notification vocabulary and typed params

`SCHEMA.md` owns the inbox union: `LEDGER_INVITE`, `JOIN_REQUESTED`, `JOIN_APPROVED`, `JOIN_REJECTED`,
`MEMBER_JOINED`, `MEMBER_LEFT`, `MEMBER_REMOVED`, `ROLE_CHANGED`, `OWNERSHIP_TRANSFERRED`,
`LEDGER_ARCHIVED`, `COMMENT_ADDED`, `LEGACY_CLAIMED`, `ANNOUNCEMENT`, and `SYSTEM`. Sharing uses those
exact names. `ITEM_ADDED` remains a separately typed push-only kind.

`notifications.params` values are `string | number`. A `*Minor` key must be an integer and must have a
sibling `currency` ISO code; renderers format it in the reader's locale. No notification projection,
stored row, or scheduled payload contains a rendered amount or sender-localized sentence.

## Files reconciled in R5

- `.notes/design/SCHEMA.md`
- `.notes/design/migration-plan.md`
- `.notes/design/sharing-invites.md`
- `.notes/design/client-ia.md`
- `.notes/design/notifications-push.md`
- `.notes/design/gaps.md`
- `.notes/design/RECONCILIATION.md`

R5 resolves G16–G21. Dependency installation remains R6; backend and app implementation remain blocked
until R6 is complete.

## R6 — G46 dependency register resolved (2026-08-24)

G46 is titled “nine dependencies” but its table contains ten rows. R6 decides all ten; a missing package is
not silently treated as an install decision.

| Package                              | Decision               | Normative reason                                                                                                                                                                                                              |
| ------------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@convex-dev/rate-limiter`           | **install `0.3.2`**    | Exact R4/SCHEMA pin; auth, invite, feedback, and report write limits.                                                                                                                                                         |
| `@convex-dev/workpool`               | **install `0.4.10`**   | Bounded migration blob concurrency; compatible with the pinned Convex/helpers versions.                                                                                                                                       |
| `@noble/hashes`                      | **install `2.3.0`**    | Shared synchronous invite SHA-256 and app-lock scrypt; v2 `.js` export paths are canonical.                                                                                                                                   |
| `expo-image-manipulator`             | **install `~57.0.12`** | Client-generated photo thumbnails are a shipped storage/performance invariant.                                                                                                                                                |
| `expo-media-library`                 | **install `~57.0.4`**  | Preserves save-to-device; D3 subsequently closed gallery UI, config, and localized permission copy.                                                                                                                           |
| `expo-clipboard`                     | **install `~57.0.1`**  | Explicitly confirmed iOS invite hand-off; never silent clipboard reads.                                                                                                                                                       |
| `react-native-play-install-referrer` | **install `2.0.1`**    | Android deferred invite discovery in the custom development/production build.                                                                                                                                                 |
| `expo-location` + map SDK            | **defer**              | Measured use is 239/34,799 items (0.7%). v1 renders migrated places read-only and opens the system Maps app through `Linking`; capture, map choice, and separate PIPA consent remain G24/D3.                                  |
| `@sentry/react-native`               | **defer**              | G34 must first define PII scrubbing, sampling, consent, release identity, and the analytics boundary for financial data. A package alone is not observability.                                                                |
| `@date-fns/tz`                       | **reject**             | `shared/date.ts` already has one Intl-backed client/server implementation. R6 adds the four strict calendar codecs, `offsetMinutesAt`, and `dayKeyRangeOfPeriod` with unit coverage instead of shipping two timezone engines. |

Expo-owned packages use SDK 57's resolved compatible ranges; the other four are exact pins. The lockfile is
generated by the repository's declared Bun `1.3.13`. `bun x expo install --fix` reports dependencies up to
date, and `expo-doctor` passes all 21 checks when a supported npm executable is available on PATH.

## Files reconciled in R6

- `package.json`
- `bun.lock`
- `shared/date.ts`
- `test/shared/date.test.ts`
- `.notes/design/SCHEMA.md`
- `.notes/design/auth-onboarding.md`
- `.notes/design/sharing-invites.md`
- `.notes/design/money-categories-i18n.md`
- `.notes/design/client-ia.md`
- `.notes/design/gaps.md`
- `.notes/design/RECONCILIATION.md`

R6 resolves only G46. G22 and the other remaining BLOCKERs still prohibit backend/app implementation;
the dependency gate itself is no longer one of them.

## D1 — G22 app shell and screen ownership resolved (2026-08-24)

`app-shell-and-screens.md` is the normative G22 acceptance contract. `client-ia.md` remains its detailed
implementation annex: the final D3-expanded 60-route target tree, all 30
legacy-route outcomes, tab/rail shell, ledger
switcher, per-screen query budgets, tablet compositions, component inventory, and state behavior. A route
is not complete merely because a file exists; it must satisfy its bounded data, loading/empty/gone/error/
offline, permission, and phone/tablet contract. D1 left feature-specific G23–G31 and legal D4 separately
visible; D3 subsequently closes G23–G31 while D4 remains open.

### Breakpoint conflict

The earlier client draft made a custom layout hook a competing breakpoint authority. Binding
`app/AGENTS.md` wins, and as of September 9 that rule names `useTabletLayout()` — the window's minimum
dimension >= 600dp — as the single structural branch. It supersedes the earlier `useCPK().media.isTablet`
resolution: cpk-ui's `isTablet` is a desktop-width media query and `Platform.isPad` ignores the actual
window, so both misclassified 600dp Android portrait tablets and split-screen windows
(`qa/android-play-recheck-2026-09-08.md`). `media.isTablet` now has zero call sites. Code still never
branches on the cumulative `isMobile` flag. `useLayoutMetrics()` may derive width, orientation, gutters,
panes and grid columns only after reading the same hook; it returns no competing phone/tablet boolean.

### Entry and upload conflict

The earlier G22 text and client flow inherited an impossible pre-POST `inFlightStorageId` protocol.
Convex 1.45's installed `StorageWriter` contract makes the upload POST response the first point at which
`storageId` exists; `generateUploadUrl()` returns only the temporary URL. `SCHEMA.md` is corrected to the
implementable authority:

1. save `items.create`/`items.update` first so the financial item remains durable if photo work fails;
2. create the client-side original/thumbnail pair, generate a URL, POST each blob, then immediately call
   `files.claimUpload` with each returned storage id;
3. `photos.attach` verifies both first-claim-wins ownership rows and atomically inserts `itemPhotos`,
   patches the item cover/count, resolves URLs once, and attaches both upload rows;
4. the claimed-row pass collects claimed/unattached blobs, while a bounded cursor over `_storage`
   collects the unavoidable POST-success/claim-crash window after `UPLOAD_CLAIM_TTL_MS`.

The form uses the SDK-57 `@react-native-community/datetimepicker@9.1.0` pin and shared
`wallClockToEpochMs` in the ledger timezone, plus the custom minor-unit keypad already required by
`money-categories-i18n.md`. Sensitive unsubmitted drafts remain component state, never MMKV. No client
may fabricate or cast a Convex document id for optimistic insertion; create rows enter queries and routes
only with the real id returned by Convex.

### Files reconciled in D1

- `.notes/design/app-shell-and-screens.md`
- `.notes/design/client-ia.md`
- `.notes/design/SCHEMA.md`
- `.notes/design/migration-plan.md`
- `.notes/design/gaps.md`
- `.notes/design/RECONCILIATION.md`
- `app.config.ts`
- `package.json`
- `bun.lock`

D1 resolves G22. D3 subsequently closes the remaining legacy feature contracts; D4 and other open
BLOCKERs still gate implementation.

## D2 — G32 application error contract resolved (2026-08-24)

`shared/appErrors.ts` is the executable single source of truth for `AppErrorCode`, the closed server-to-
client message-key list, `AppErrorPayload`, and untrusted wire guards. It is pure TypeScript and is
covered directly in Jest. `convex/lib/errors.ts#appError` is the sole client-visible server constructor;
the `authError` name and direct `new ConvexError` call sites are removed from subsystem designs.

### Result union vs thrown error

A function-specific discriminated return union is used only when all branches are normal outcomes the
current screen can exhaustively render, such as invite preview/redeem and handle availability. A rejected
function contract—authentication, account gate, permission, invalid command, maintenance, ownership, or
role rule—throws `appError`. `invites.redeem` intentionally retains rate limiting in its result because
that card owns the countdown; generic writes throw `RATE_LIMITED` with raw retry seconds.

### Ledger error conflict

Sharing previously collapsed ledger errors to generic `NOT_FOUND`/`FORBIDDEN` and constructed them with
`authError`. The shared union now owns `LEDGER_NOT_FOUND`, `LEDGER_FORBIDDEN`, `LEDGER_ARCHIVED`,
`LEDGER_MAINTENANCE`, the peer/role/ownership constraints, and the member cap. The G32 proposal's
`NOT_A_MEMBER` is deliberately rejected: an inactive/non-member row uses `LEDGER_NOT_FOUND`, identical to
a missing ledger, so an opaque document id cannot confirm existence. Known members lacking a management
role use `LEDGER_FORBIDDEN`.

`convex/lib/permissions.ts` owns account gates. `convex/lib/ledgerPermissions.ts` owns
`requireLedgerMember` (the VIEWER-minimum membership alias) and ranked `requireLedgerRole`. Binding
`convex/AGENTS.md` and `CLAUDE.md` now state those entry points, the reconciled underscore-joined index
grammar, and the shared error wire shape rather than their stale draft conventions.

### Client behavior

`error-handling.md` owns code/context classification and the route, field, inline, snackbar, dialog, and
render-boundary surfaces. Expected function errors are caught by the operation owner and never re-thrown
during render. Root and screen/tab boundaries contain unexpected React failures only. Retry is manual and
operation-aware: no automatic rate-limit/OCC loops and no blind repeat of a non-idempotent mutation after
an ambiguous network completion.

The server never sends a rendered sentence. All 69 allowed error message keys exist with identical
structure in ko/en/ja/zh/id. The client maps allowed wire keys to renderers containing static literal
translation calls; unknown code/key falls back to `error.generic`. Params are raw finite strings/numbers
and diagnostics explicitly exclude money, identity, memo/place/photo data, storage URLs/ids, invite
codes, tokens, and provider payloads.

### Suspension gap resolved with the same gate

G55 is resolved rather than merely adding an unused enum member. `beforeSessionCreation` refuses new
suspended sessions, `requireActiveProfile` cuts off already-live capabilities, and the root projection
exposes only a `suspended` gate boolean. `/account/suspended` is the 59th route and mounts localized
appeal/help plus Sign out without a ledger query. Soft-deleted users still receive the restricted session
needed for the separate restore flow; purged users still cannot create a session.

### Files reconciled in D2

- `shared/appErrors.ts`
- `shared/index.ts`
- `test/shared/appErrors.test.ts`
- `test/shared/purity.test.ts`
- `.notes/design/error-handling.md`
- `.notes/design/SCHEMA.md`
- `.notes/design/auth-onboarding.md`
- `.notes/design/sharing-invites.md`
- `.notes/design/money-categories-i18n.md`
- `.notes/design/client-ia.md`
- `.notes/design/app-shell-and-screens.md`
- `.notes/design/gaps.md`
- `.notes/design/RECONCILIATION.md`
- `assets/langs/{ko,en,ja,zh,id}.json`
- `convex/AGENTS.md`
- `CLAUDE.md`

D2 resolves G32 and also closes G55/G56. D4 and the still-open measured-data BLOCKERs remain explicit;
no backend/app implementation is authorized until every BLOCKER has a recorded resolution.

## D3 — G23–G31 legacy feature contracts resolved (2026-08-24)

`legacy-feature-contracts.md` is the normative D3 annex to the G22 shell. It closes the nine legacy
feature owners without weakening the measured-data or schema authority and takes the final target tree to
60 routes: the unshipped location picker seam is removed, while profile default-currency and guarded
ADMIN operations become real settings routes. R5's `notifications-push.md` remains the sole push-on-add
contract; D3 does not redefine it.

### G23/G24 — least-privilege media and location

The photo library conflict is resolved from the installed SDK surface, not an older package example.
cpk-ui `PinchZoom` inside `react-native-pager-view@8.0.2` owns the viewer; there is no gallery/second zoom
package. Expo Media Library 57's root `saveToLibraryAsync` is a runtime-throwing legacy shim, so save
downloads an extension-bearing cache file and uses action-time write-only photo permission plus the new
`MediaLibrary.Asset.create`. Expo config requests only photo granularity, registers all five native
locale catalogs, and owns `NSPhotoLibraryAddUsageDescription`. Delete remains an authorized
`photos.detach`, not deletion from the user's device library. D4 still gates the receipt URL lifetime.

The measured profile overrides feature ambition for location: 239/34,799 source children (0.7%) justify
preserving label/address/coordinates without collecting new ones. V1 links valid stored coordinates to
the system Maps app and ships no picker route, map/static-map call, `expo-location`, or native location
permission. Capture can return only with provider, separate D4 consent, kill switch, permission states,
and store disclosures in one release.

### G25/G30 — executable statistics and color contracts

Victory Native 41 is the chart API and its installed Skia 2.6 peer is the renderer, ending the false
either/or decision. The donut sorts exact rollups into seven real slices plus one summed Other slice;
the running balance remains the SCHEMA cold/hot composition and the trend is exactly twelve ledger-zone
months. Every canvas value is duplicated in labelled rows/lists, honors Reduce Motion, and never relies
on color alone.

`src/theme.ts` now has a concrete no-`any` light/dark shape for every cpk bucket. Ledger identity colors
live separately in `src/theme/ledgerAccent.ts`; fifteen category token mappings live in
`src/theme/chartPalette.ts`. The gap register counted fourteen but the authoritative preset map also
uses `category.green` for insurance/salary, so the executable mapping correctly contains fifteen. This
separation is required because cpk drops nonstandard top-level theme
groups and ledger/category identities are not global component roles. The test suite computes relative
luminance and enforces 4.5:1 across intended text, button, accent, and category-canvas pairs.

### G26 — amount-only search is not a full-text filter

The earlier schema claim that exact amount was “free” as a search filter was not implementable. Convex
full-text search always requires one text expression; equality filter fields only refine that expression.
`SCHEMA.md` therefore owns two bounded functions:

- `searchMemo`, using `search_memo` with optional exact type/category refinement; and
- `searchAmount`, using new
  `by_ledgerId_deletedAt_type_amountMinor_dayKey_occurredAt`, one type stream or a two-way merged stream.

Both read 31 and return 30 plus `truncated`, accumulate no paginated subscriptions, and never JS-filter
`ledgerItems`. Category is deliberately single-select and unavailable in amount mode; numeric substring
matching is not preserved. The new index changes `ledgerItems` from eight to nine maintained index
entries per row. D6's durable-create idempotency later adds one ordinary index, so the current SCHEMA
import/storage budget is 10M entries at one million items.

### G27/G28/G29/G31 — screen and state ownership

The tutorial proposal's MMKV pre-auth gate is rejected. The three-page native pager is a non-blocking
hero on the auth landing, and sign-in actions are always reachable; ToS/privacy surface exists there but
D4 owns its production URLs/copy/evidence. Push consent remains the post-ledger contextual request from
R5, never a bundled marketing/auth checkbox.

Announcements/FAQ are capped at 50 live rows per kind and queried with one extra invariant row. NOTICE
read state is the largest rendered `publishedAt` in MMKV, not `Date.now()` and not a write to the hot
co-member profile document. A real ADMIN-only in-app ops route authors five-locale content, typed app
config, and feedback triage through server-guarded mutations. `appAnnouncements` gains optional seed-
compatible creator/updater ids; ongoing authoring always writes them. Unauthenticated CLI calls and
direct table edits are not the operations contract.

Language remains a user UI/server-rendering preference; preferred currency is explicitly only the
default for new ledgers; base currency/timezone/week/period/color/policies remain shared ledger facts.
The assumed-currency banner remains until the authoritative one-time confirmation. D1's three-degree
layout applies to all of these routes, and `useTabletLayout()` remains the only structural breakpoint.

### Files reconciled in D3

- `.notes/design/legacy-feature-contracts.md`
- `.notes/design/app-shell-and-screens.md`
- `.notes/design/client-ia.md`
- `.notes/design/SCHEMA.md`
- `.notes/design/gaps.md`
- `.notes/design/RECONCILIATION.md`
- `app.config.ts`
- `assets/langs/meta/{ko,en,ja,zh,id}.json`
- `src/theme.ts`
- `src/theme/{ledgerAccent,chartPalette}.ts`
- `src/styled.d.ts`
- `test/src/theme.test.ts`
- `package.json`
- `bun.lock`

D3 resolves G23–G31. D4 and every other still-open BLOCKER in the register remain implementation gates;
the backend/app implementation phase is not yet authorized merely because the client feature contracts
are now complete.

## D4 — G37, G38, and G41 legal/privacy/release contracts resolved (2026-08-24)

### Queue-label correction and authority

The former STATUS row labelled D4 as G40/G46/G56, but its prose described G37 (legal/export), G38
(receipt-photo URLs), and G41 (release/store). G46 was already completed by R6, G56 by D2, and G40 is the
still-open testing-strategy gap. D4 therefore corrects the row rather than pretending to close unrelated
work. G40 is explicitly queued in D7. This correction changes no gap number or historical resolution.

`SCHEMA.md` remains authoritative for field/table shape and
`research/15-REAL-DATA-PROFILE.md` remains higher authority for the measured 724 photos and migration
shapes. D4 adds `privacy-and-compliance.md` and `release-and-store.md` as the normative behavior/release
annexes and propagates their decisions back into the schema and subsystem contracts.

### G37 — legal basis, evidence, rights, and two exports

The gap register's legal premise is corrected. PIPA Article 35 provides an access right, while Article
35-2's machine-readable transmission right is limited by statute/decree scope; BooKoo does not invent a
universal “30-day PIPA export” requirement. Self-service export still ships as a product commitment and
for applicable regimes such as GDPR.

Core account/shared-ledger processing uses the service-contract basis, not a fake mandatory “optional
consent.” Account finalization records three separate, version/hash-validated facts: affirmative Terms
acceptance, Privacy Notice acknowledgement, and a 14+ attestation. Optional location/marketing grants are
separate and revocable; marketing and new location collection are absent at launch. Social providers
request only stable subject, vouched email when available, and optional public-profile name/avatar. Gender,
birthday, birth year, phone, friends, and marketing scopes are rejected.

`legalEvents` records minimal versioned evidence without IP, user agent, or fingerprint. Public five-locale
surfaces are fixed at `/legal/privacy`, `/legal/terms`, `/privacy-choices`, `/account-deletion`, and
`/support`; a missing/non-HTTPS/non-200 production URL blocks release.

Personal export and ADMIN+ ledger export are separate v1 products:

- `dataExports` owns requester/scope/state/expiry; its exact requester/kind/ledger/state index enforces one
  active request per scope, while request history remains paginated.
- `dataExportFiles` owns protected, deterministic JSON/CSV/ZIP parts no larger than 18 MiB. A manifest
  records schema version, part hashes/sizes, and named omissions.
- Downloads require the Convex Auth Bearer token and requester ownership on every request. Storage ids and
  reusable storage URLs never cross the wire. The existing daily purge handler deletes expired blobs and
  part/job rows, uses `EXPIRED` only as a crash-safe checkpoint, then hard-deletes the request, preserving
  R4's single eleven-cron registry. Export job keys include `dataExportId`, so successive requests never
  alias a worker cursor.
- Account deletion immediately destroys export jobs/blobs. Shared financial facts may remain de-identified
  for co-member balance integrity, but the deleting account's comments, uploaded receipt bytes,
  credentials, emails, profile PII, and provider material are purged after the recovery window. Receipt
  ownership is never silently transferred.

The retention matrix replaces “forever” with explicit lifecycle owners. Auth/legal evidence is retained
for the account lifetime plus three years unless a documented hold applies; the existing account-purge
maintenance path later removes it. Unclaimed-legacy retention remains intentionally gated on measured-data
task D5 rather than being guessed in D4.

### G38 — receipt media is authenticated, including thumbnails

D4 rejects the proposed public-thumbnail compromise. Both originals and thumbnails are private:

- `ledgerItems.coverPhotoId` replaces `coverThumbUrl`.
- `itemPhotos.storageId` and `thumbStorageId` remain server-only; `url`/`thumbUrl` are removed.
  `legacyUrl` is migration input only, never serialized/rendered, and is cleared after verified copy.
- `PrivateImage` builds a route from the photo id, supplies `useAuthToken()`'s JWT in the Expo Image source
  headers, and is the only receipt renderer. The HTTP action resolves photo → live item → live ledger →
  current active membership for every request, returns storage bytes rather than a redirect, and collapses
  absent/unauthorized/deleted cases to the same 404.
- Originals are `private, no-store`; thumbnails are private with five-minute revalidation and
  `Vary: Authorization`. Both use Expo Image's memory-only cache; sign-out/account switch/membership loss
  clears image and ledger caches defensively.
- Claim-time limits are 15 MiB original and 1 MiB thumbnail, below Convex's 20 MiB HTTP-action response
  limit. The export part limit is 18 MiB for the same reason.

The measured profile overrides the old launch sequence: all 724 photos require a verified copy or an
explicit per-row support disposition before public cutover. P12 drains before maintenance mode is lifted;
there is no `storageId ?? legacyUrl` release and no D+7 client fallback removal.

### G41 — new store listing and production evidence

The new app is a new listing for `dev.hyo.bookoo`, not an update to
`com.dooboolab.bookoo`. `release-and-store.md` owns placeholder/external-id gates, five-locale metadata,
privacy/Data safety/rating answers, synthetic reviewer access, a legacy-listing notice, and thirteen
evidence-based production gates. Old Play screenshots may be checksummed under ignored
`.local/store-assets/legacy/` as private references; they may not be stretched or relabelled as new iPhone
screenshots. Store submissions use actual shipping builds and deterministic non-PII demo data across:

- 6.9-inch iPhone portrait at 1320×2868;
- 13-inch iPad landscape at 2752×2064 (or an accepted 2732×2048 master);
- Android phone portrait at 1080×1920;
- Android 10-inch tablet landscape at 1920×1080;
- eight truthful scenes in each of ko/en/ja/zh-Hans/id, with a deliberate light/dark mix.

Synthetic does not mean obviously test-shaped. Store and review captures use one
coherent working-and-studying adult household persona with natural salary,
groceries, transport, cafe and study-material entries. Names such as `Codex QA`,
`test`, lettered private ledgers, placeholder addresses and diagnostic labels are
forbidden in the visible capture surface even though the underlying accounts remain
non-PII test identities.

The launch privacy baseline has no analytics, crash-reporting, ads, ATT, bank connection, OCR, or new
location collection. Convex, Expo, Resend, and the enabled identity providers require current processor/
overseas-transfer evidence before release. Adding Sentry/analytics/maps later is a privacy and store-label
change, not a dependency-only edit.

### Remaining implementation gates are explicit

D4 closes only G37/G38/G41. Implementation remains blocked by measured-data BLOCKERs G48/G49/G51 and
their related migration decisions, now queued as D5. D6 owns offline/observability/boot/moderation/
accessibility/cache-provider design. D7 owns the still-open G40 testing work plus security, migration-code,
API/package drift, and small contradictions. STATUS makes I1 depend on D5–D7; completing R1–R6 alone was
never enough.

### Files reconciled in D4

- `.notes/design/privacy-and-compliance.md`
- `.notes/design/release-and-store.md`
- `.notes/design/SCHEMA.md`
- `.notes/design/auth-onboarding.md`
- `.notes/design/sharing-invites.md`
- `.notes/design/client-ia.md`
- `.notes/design/app-shell-and-screens.md`
- `.notes/design/legacy-feature-contracts.md`
- `.notes/design/migration-plan.md`
- `.notes/design/gaps.md`
- `.notes/design/RECONCILIATION.md`
- `.notes/STATUS.md`

## D5 — G48–G54 measured migration resolved (2026-08-24)

### Authority and corrected census

`research/15-REAL-DATA-PROFILE.md` is explicitly above `SCHEMA.md` for measured production facts;
`SCHEMA.md` remains above all other designs. A PII-safe aggregate re-run corrected the old coarse profile:
RTDB has 434 users without a usable profile email (270 without `info`), while the exact provider-derived
`orphan_no_email` population still requires the password-stripped Auth export. The honest destination
boundary is 1,784 ledgers, 34,798 items, 1,783 comments, 724 photos, and 2,184 memberships.

### G48 — both review shapes, and no speculative identity recovery

P8 explicitly normalizes 1,310 maps and 378 arrays, ignores two null holes, and uses a string array index
as the review-key component. All 399 embedded user snapshots go only to time-limited
`itemComments.legacyRaw`; they never enter projections or merge control flow. The proposed P1.5 profile
backfill is rejected by the higher-authority measurement: among all 270 users without `info`, the
snapshots recover zero names and zero avatars.

### G49 — malformed container and ghost item

The 1,785th child under the ledger root is not a degenerate tenant: it is a malformed container holding
two item-shaped orphans with no ledger relationship. Creating a blank ledger or assigning `__unknown__`
would fabricate tenancy. P2 instead emits no ledger and archives two `ORPHAN_ITEM_NO_LEDGER` anomalies.
The review-only ghost under a real ledger is prechecked before money parsing and yields one item plus one
review anomaly under `GHOST_ITEM_ONLY_REVIEWS`, both `producedRow: false`. These two dedicated literals
are now in the authoritative schema; there is no misleading fallback kind.

### G50 — no-email recovery is a launch feature, without an automatic purge

The 434 RTDB rows are reported separately from the Auth-only `orphan_no_email` count, and the exact Auth
count is a rehearsal gate rather than an architecture toggle. Launch includes the help UI, ownership
rescue, and dual-approved support force-claim. Support requires an authenticated target plus two
independent signals where available; screenshots alone never suffice, evidence remains in the ticket
system, Convex records only actor/reference audit data, and insufficient proof is refused.

Sole-member orphan ledgers get `orphanedAt` but no `purgeAfter`. Month 24 starts quarterly purpose review,
not deletion. Any later cohort destruction needs a separately approved retention change, attempted notice
where possible, and proof that no member or open claim depends on the data.

### G51 — deterministic required timestamps

Of 3,855 item-shaped nodes without `created`, one is the skipped ghost. Every one of the 3,854 valid rows
has both a parseable `updated` and a decodable push id. The required chain is therefore
`created → updated → push-id timestamp`; unresolved is a normalization failure and `Date.now()` is
forbidden. `legacyCreatedAt` remains absent when the source field was absent, `updatedAt` falls back to
the resolved `createdAt`, and missing memo becomes `''`. The apparent missing amount/selected date also
belongs to the ghost and never reaches a money/date transform.

### G52 — measured category cap and sentinel read

The exact five-locale classifier produces 1,598 custom triples across 505 ledgers, zero unrecoverable
triples, and at most 54 customs in one ledger. The complete worst overlay is 88 rows (34 presets + 54),
so the 120 cap remains. P6 freezes and asserts the aggregate before writing; runtime category reads use
`.take(121)` and reject a sentinel row. `.collect()` and silent truncation are both removed.

### G53 — observed import size is separate from the future stress model

The 1M-item/100k-photo tables remain future architecture checks, not migration estimates. The observed
P7 is about 116 batches and P12 has 724 photos. The workpool remains for retry/backoff, bounded
concurrency, and terminal-state accounting; all item-photo `PENDING + FAILED` rows must reach zero before
public cutover.

### G54 — exactly two natural idempotency exceptions

P7 now requires a legacy trailer only when a migrated table lacks a natural unique key.
`ledgerMemberState.by_ledgerId_userId` and `ledgerCategories.by_ledgerId_key` are the only exceptions and
are used for per-row dedupe and key-set checks. All other migrated tables keep their globally unique
legacy key and `by_legacyKey` index.

### Files reconciled in D5

- `.notes/research/15-REAL-DATA-PROFILE.md`
- `.notes/design/SCHEMA.md`
- `.notes/design/migration-plan.md`
- `.notes/design/auth-onboarding.md`
- `.notes/design/money-categories-i18n.md`
- `.notes/design/gaps.md`
- `.notes/design/RECONCILIATION.md`

## D6 — G33–G36/G39/G45 cross-cutting contracts resolved (2026-08-24)

### Authority and the launch privacy boundary

No measured-production fact in `research/15-REAL-DATA-PROFILE.md` conflicts with D6. `SCHEMA.md` remains
the data/function authority. Where G34 proposed Sentry plus product analytics, D4's already-reconciled
privacy/store baseline wins: the launch app collects no analytics/diagnostics automatically and ships no
third-party crash/log/session-replay SDK. D6 supplies an operating model rather than reopening that legal
decision.

### G33 — encrypted, honest, idempotent offline writes

Convex reconnect remains the transport owner, but its in-memory mutation queue cannot survive process
death. `offline-and-caching.md` adds a separate MMKV instance encrypted by a random key in device-only
SecureStore. Exactly item create/update and comment create write there; online calls use the same path.
The UI distinguishes component draft, durable device-pending, and server committed.

The gap's proposal to put only `clientRequestId` on `ledgerItems` is insufficient for repeated updates.
D6 stores UUID+server hash on item/comment create rows, and adds a 30-day
`clientMutationReceipts` table plus `expectedUpdatedAt` for update. Matching replays are no-ops; hash
mismatch uses the existing generic invalid-input wire contract; revision mismatch is an explicit conflict
result and never overwrites. The schema grows to 38 application tables, ledger item maintenance grows to
9 ordinary + 1 search index (10M entries in the 1M stress model), item comments to four indexes, and item
updates add one receipt write. The existing soft-delete cron purges receipts, so the eleven-job registry
does not change; ledger and account purge also delete any remainder without depending on cron order.

The old plaintext MMKV examples conflict with D4's financial-data rule. D6 permits only encrypted,
account-partitioned mirrors and changes the exact four families to `me`, `listMine`, latest
`daysInRange`, and item page zero. `daysInRange` replaces `rollups.month` because it can paint Calendar
markers and derive the visible total; the reverse is impossible. One bounded derived recent-category
ordering contains keys only and shares the encrypted account budget; it is not a fifth query mirror.
Photos/local URIs and every other mutation remain online-only.

### G34 — observable without a new collection pipeline

`observability.md` chooses a closed 200-event memory ring, explicit previewed support bundles, Convex
Health/Functions/Logs, Apple/Google opt-in aggregate crash/ANR reports, and deterministic release-device
benchmarks. Forbidden financial/identity values cannot enter the typed logger. The p50 ≤450 ms / p95
≤900 ms claim is now a ≥20-run production-mode device sample, not an uncollected fleet percentile.

Convex exposes mutation retry counts through paid log streams, not the assumed launch dashboards. The
old exact “>0.5% rolling hour” OCC trigger is therefore not fabricated; launch stops/investigates on any
sustained `items.create` write-conflict insight or retry-shaped latency regression. A future exact rate
requires the separate processor/privacy/cost adoption gate.

### G35/G45 — one boot state machine and one provider tree

`boot-and-providers.md` is the only complete provider tree: one Cpk SafeArea → root boundary → keyboard/
action sheet → Convex Auth → session-epoch query cache → Locale → AccessibilityPreferences →
Connectivity → SensitiveStorage → BootGate → AppLock → AuthGate → ready-only Outbox/LedgerAccent/
Notification/navigator. Query memory is remounted before sign-out/account switch; private providers
never mount for a non-ready session.
This deliberately supersedes the older auth sentence saying app lock never pauses background sync: the
v1 outbox drains only while foregrounded and unlocked, while already-registered OS push delivery remains
unchanged.

BootGate enforces only a live config, in maintenance → minimum native build order, and fails open after
1.5 seconds unresolved. Cached config never blocks. Expo's current runtime contract requires
`Application.nativeApplicationVersion/nativeBuildVersion`; `expo-application@~57.0.2` is now a direct
dependency rather than an accidental transitive one. The required Expo SDK compatibility pass refreshed
the SDK 57 patch pins and registered the already-installed `expo-sharing` plugin with both inbound-share
targets disabled. A root `expo-constants@57.0.14` override deduplicates `expo-linking`'s compatible
`~57.0.13` range so the native module graph stays singular. OTA check/download is bounded and reload
defers over dirty work; the strict-SemVer store nag is dismissible once per exact version every seven days.

### G36 — safety checks cannot corrupt accounting truth

Account blocks are directional rows but symmetric interaction gates. Direct account invites check the
pair; redeem/request/approval check the candidate against every active member in both directions, bounded
by the 200-member sentinel. This is stronger than the gap's creator-only proposal and closes the actual
“follow a blocker through somebody else's link” path. An already-live co-member keeps membership and all
financial rows/totals; identity/comments/push are hidden or muted and the UI offers leave/governed remove.
Comment pages independently project ≤20 distinct authors plus both directional block reads, so former
members cannot bypass the live roster. Person-caused social notifications are pair-filtered before row or
push creation; mandatory authorization-state events remain visible with a generic actor. Item-activity
push adds the same bounded pair filter, changing its realistic/worst read ceilings to 93/2,589.

`moderation-and-safety.md` specifies report surfaces, subject/access/rate validation, reporter secrecy,
oldest-first ADMIN queue, 24-hour triage coverage, appeal, and atomic typed resolutions. Comment removal,
item-content redaction, governed member removal, and account suspension preserve shared money/history and
reuse existing counters/owner/session/audit invariants. The schema records acknowledgement, context,
resolution, and an opaque ticket reference rather than leaking free-form ops notes.

### G39 — accessibility is app behavior, not a Calendar-only promise

`accessibility.md` owns dynamic type/reflow, platform touch minima, focus/live regions, spoken financial
semantics, chart data alternatives, PIN/photo/offline/moderation/update states, Reduce Motion, contrast,
and the physical VoiceOver/TalkBack release matrix. The proposed global `Text.defaultProps` wrapper is
rejected because it mutates third-party/cpk behavior; BooKoo primitives forward native props instead.
Normal text is uncapped; dense Calendar/chart geometry may cap at 2.0 only with a complete uncapped
alternative. Calendar's old 1.6 default is corrected. Its nonexistent Storybook CI is no longer claimed;
D7/I4 must implement a gate before reporting it green.

### Remaining gate

D6 resolves designs only. D7 still owns executable testing/security/migration/package/API cleanup and
remains the last design dependency before I1. No Convex deployment, EAS build, provider-console change,
or store submission occurred in D6.

### Files reconciled in D6

- `.notes/design/offline-and-caching.md`
- `.notes/design/observability.md`
- `.notes/design/boot-and-providers.md`
- `.notes/design/moderation-and-safety.md`
- `.notes/design/notifications-push.md`
- `.notes/design/accessibility.md`
- `.notes/design/SCHEMA.md`
- `.notes/design/app-shell-and-screens.md`
- `.notes/design/client-ia.md`
- `.notes/design/auth-onboarding.md`
- `.notes/design/sharing-invites.md`
- `.notes/design/error-handling.md`
- `.notes/design/privacy-and-compliance.md`
- `.notes/design/release-and-store.md`
- `.notes/design/money-categories-i18n.md`
- `.notes/design/calendar-component.md`
- `.notes/design/migration-plan.md`
- `.notes/design/gaps.md`
- `.notes/research/13-convex-scale.md`
- `package.json`
- `bun.lock`
- `app.config.ts`
- `.notes/design/RECONCILIATION.md`

## D7 — G40/G42–G44/G47/G57–G60 operational quality resolved (2026-08-24)

### Authority and honest gate states

The measured profile contains no production fact that changes these operational decisions, so
`SCHEMA.md` remains authoritative. D7 distinguishes a locally executable design-policy gate from a
cloud/evidence gate that cannot exist until its owning implementation phase. No Convex preview, external
console, credential rotation, EAS build, load test or store action was performed or claimed.

### G40 — policy is executable now; cloud budgets become mandatory with their code

`lint:all` is now check-only and includes five-locale key/placeholder/plural/metadata verification,
exhaustive dependency ownership, tracked-snapshot secret checks, a typed 38-table/index/lifecycle schema
manifest, and staged readiness checks. Schema lint reports policy-only status while I1 is pending, checks
every table/index as soon as implementation appears, and fails if I1 is marked DONE without schema.
CI no longer skips TypeScript when a secret or generated API is absent; I1 must commit the generated
client types once source imports require them.

Tier 2 is an I3 deliverable because D7 has no functions or seed mutation to deploy. I3 cannot be marked
DONE unless deterministic seeds, the transaction-budget suite, and an anonymous-local CI job exist.
Secretless forks run the same gate. Tier 3 is a P1 deliverable: the raw synthetic load log
stays local and a dated aggregate report under `docs/perf/` records eight-writer OCC conflict rate and
the §5.4 decision. The PR template demands query-budget and release evidence instead of accepting a
silent skip.

### G42/G43 — secrets and migration PII have one operating boundary

`operations-and-quality.md` owns a dated credential ledger. The legacy Firebase account/key, Sentry
token, Maps keys, AdMob/Amplitude/Facebook apps, JKS, Apple certificates, and all new provider/EAS/CI
credentials each have an owner, action time and evidence shape. Every external row remains pending until
the console action happens. Local history inspection found no tracked `BooKooLegacy/` path and the
snapshot verifier confirms `.local/`, legacy source and non-example env files are ignored; this is not
evidence that secrets in a separate historical repository were revoked.

Full reachable history is scanned by pinned Gitleaks in CI. EAS now excludes `.local/` and every real
`.env*`; build secrets come only from EAS Environment Variables. Migration code lives under
`scripts/migrate/`/`convex/migrate/`; every private artefact lives under `.local/migration/**`, never
prints PII, and is destroyed after the 90-day signed post-cutover window absent a dated minimal hold.
The migration email normalizer becomes byte-diff gated as soon as M1 creates it.

### G44/G47 — current APIs and owned dependencies

The two one-argument auth point reads are corrected to `db.get('users', userId)` and
`ctx.db.get('legacyUsers', id)`. Convex directory rules already require two arguments; schema lint now
enforces the call shape in actual Convex source. The stale handle history and push-token examples also
use the authoritative indexes.

Every remaining direct dependency has one explicit owner in `scripts/verify-dependencies.ts`. Six dead
packages are removed: `@backpackapp-io/react-native-toast`, `expo-auth-session`,
`@react-native/metro-config`, `dotenv-cli`, `eslint-plugin-prettier`, and `resend`. The designed paths are
cpk Snackbar, `expo-web-browser`, Expo Metro, direct environment access, standalone Prettier config, and
server-side `fetch` to Resend. `CLAUDE.md` and script rules are aligned with the tracked notes, five
locales, numeric bucket keys, no `.collect()`, private media ids, and current Expo patch pins.

### G57–G60 — one TTL, locale, rate and history answer

Invite links default to seven days with a 90-day server cap. `DEFAULT_LOCALE` remains English only as
the no-signal fallback; device locale is resolved during onboarding before the D6 ready-only notification
provider registers a push target, and locale-specific OTP providers already know it. Availability
checking remains an unlimited cached one-index query; claim and rename mutations own abuse throttles.
Handle history uses `by_userId_claimedAt.order('desc').take(50)`, never the removed `by_userId` index.

### Files reconciled in D7

- `.notes/design/operations-and-quality.md`
- `.notes/design/SCHEMA.md`
- `.notes/design/auth-onboarding.md`
- `.notes/design/migration-plan.md`
- `.notes/design/gaps.md`
- `.notes/design/RECONCILIATION.md`
- `AGENTS.md`, `CLAUDE.md`, `convex/AGENTS.md`, `scripts/AGENTS.md`, `scripts/README.md`
- `package.json`, `bun.lock`, `.gitignore`, `.easignore`, `jest.config.ts`, `.eslintrc.js`
- `scripts/lint-schema.ts`, `scripts/verify-langs.ts`, `scripts/verify-dependencies.ts`,
  `scripts/verify-secrets.ts`, `scripts/verify-readiness.ts`
- `.github/workflows/ci.yml`, `.github/pull_request_template.md`, `docs/perf/README.md`

## I1 — frozen schema implemented and deployment-validated (2026-08-24)

I1 materializes all 38 application tables plus the seven Convex Auth tables from `SCHEMA.md` into 22
table-bearing schema units plus `common.ts`, assembles them in `convex/schema.ts`, mounts the rate
limiter and named `blobImport`
workpool in `convex/convex.config.ts`, and commits Convex-generated client/server/data-model types.
`scripts/lint-schema.ts` now exercises its implemented-table path and classifies every table, ordinary
index, search index, lifecycle and soft-delete rule.

Implementation exposed three non-semantic defects in the paste-ready prose and corrected both the
document and code:

- `@convex-dev/workpool@0.4.10` accepts only the component name at `app.use`; `maxParallelism: 20` is a
  `new Workpool(components.blobImport, …)` client option owned by the migration worker.
- Wildcard path examples such as `ledgers/*/owner` contain the `*/` token inside a block comment and
  make valid TypeScript impossible, so code comments use explicit `{ledgerKey}`/`{uid}` placeholders.
- The §1.2 file-layout exception list was incomplete; it now names every actual coupled multi-table
  schema unit used by the authoritative `schema.ts` block.

The existing development deployment `amiable-cormorant-231` accepted the complete schema, installed
both components, created the ordinary/search indexes, generated `_generated`, and reported Convex
functions ready. No production deployment or user-data import occurred.

## I2 — auth/onboarding implementation reconciliation (2026-08-24)

Implementation against the installed `@convex-dev/auth@0.0.95` exposed one security-relevant library
behavior that the prose API sketch did not account for: the default email-provider request path writes the
typed address to `users.email` before the OTP is verified. I2 therefore supplies a custom
`createOrUpdateUser` callback. A request-only row is anonymous and has no profile or email; only a
successful verification may write `users.email`, `userEmails`, or start a legacy claim. This preserves
auth invariant I2 and prevents both takeover and email-namespace poisoning.

Root `convex/AGENTS.md` forbids `Date.now()` in queries. Handle cooldown and recent-rename queries now take
a client-frozen `now` argument, while mutations continue to use transaction time. The handle screen freezes
that value for its mount, validates locally, debounces the live query by 350 ms, and still treats the claim
mutation as authoritative. Suggestions use a stable hash tail rather than `Math.random()`, so repeated
screens, tests, and OCC retries probe the same bounded index keys.

The earlier advisory confusable-handle warning cannot be implemented under authoritative `SCHEMA.md`:
`userHandles` has neither a confusable key nor an index, and scanning all handles is prohibited. I2 keeps
`confusableKey` for profanity/reserved-name folding and removes the unindexed cross-user warning. Adding
that warning later requires an explicit schema/index change; it is not silently approximated with a scan.

The email-link path also moves every locale-scoped OTP credential for a newly re-verified address in the
same mutation that reassigns `userEmails`; otherwise an older `authAccounts` row could continue routing a
fresh mailbox OTP to the prior account. A known provider reporting a newly verified address adds proof to
`userEmails` but does not replace an existing primary address; only the explicit `setPrimaryEmail` mutation
updates the two primary mirrors. The existing development deployment received only generated auth signing
keys and I2 functions. No production environment, imported user data, or paid external resource was changed.

## I3 — ledger core and transaction budgets (2026-08-24)

I3 implements ledger membership, category overlays, item CRUD, soft-delete/restore, and the day/month/
category/balance rollup deltas as one transaction through the registered mutation wrapper. Every public
handler enters through the shared account and role gates, every read is indexed and bounded, and client
projections exclude private profile, storage, legacy, and checksum fields.

### Public roster projection vs the frozen read budget

The earlier `PublicMember` sketch included an optional per-ledger nickname. Returning it would require
reading all eight `memberStates` rows in addition to eight memberships, eight profiles, eight handles, and
the ledger gate: 40 documents for a query whose authoritative §4 budget is exactly 32. The measured profile
does not establish a shared-nickname requirement, so the authoritative §4 budget wins over the earlier
§7.6 projection sketch: the I3 roster omits `nickname`. The private member-state row remains available to
its owner; adding shared
nicknames later requires an explicit schema/index and budget decision.

### Current Convex metrics and isolated cleanup

The installed Convex API reports `documentsRead`, not the stale `documentsScanned.used` example, and the
budget boundary is inclusive. The schema contract and executable assertions use
`documentsRead <= BUDGET[queryName]`. CI exercises the fixture in Convex's anonymous local backend. It uses
no cloud deployment slot, deploy key, Management PAT, or shared data, so PR checks are deterministic and
available to forks. After all checks succeed, only a push to `main` may deploy that exact commit to
production with a production-scoped key.

A fresh local Convex backend—not the shared development deployment—was seeded with the deterministic
100,000-item, five-year, eight-member, 40-category fixture. All 15 §4 assertions passed with these exact
document reads/budgets: `60/60`, `25/25`, `127/127`, `1/1`, `28/31`, `32/32`, `40/121`, `30/30`,
`31/31`, `31/31`, `33/120`, `60/120`, `12/12`, `30/30`, and `2/2`, in the test's frozen query order.
The integration suite passed all 16 tests in 98 seconds. This is dated local transaction evidence; the
cloud preview CI job was later retired in favour of the anonymous local gate after provider quota and
`start_push` reliability made PR results depend on unrelated cloud state. The existing
`amiable-cormorant-231` development deployment received the I3 functions only; no
production deployment, external provider project, user-data import, or paid resource was created.

## I4/I5 — sequential screen-delivery boundary (2026-08-24)

`app-shell-and-screens.md` describes the complete release tree as one acceptance surface, including
privacy, legal, export, private-media, moderation, offline, accessibility, boot, and operations routes.
The later executable queue in `STATUS.md` deliberately assigns those D4/D6/D7 surfaces **end to end** to
I5, sequentially after I4. Reading both literally would either make I5 empty or require I4 to implement a
later blocked task. This is an implementation-sequencing conflict, not a schema or measured-data conflict.

The normative delivery boundary is therefore:

- I4 owns the ready app shell, four tabs plus the add pseudo-tab, one active-ledger state, phone/tablet
  compositions, entry CRUD, calendar, bounded timeline, statistics, search, ledger management, profile,
  appearance, language, account-session, and about surfaces backed by I1–I3 APIs.
- I5 owns every remaining target route and cross-cutting state whose real behavior depends on D4/D6/D7,
  including legal/privacy/export/deletion, authenticated receipt media and comments, durable offline
  writes/cache, moderation, accessibility release evidence, boot/update/lock, notifications/content/
  feedback, and guarded operations. I4 must hide these destinations rather than ship placeholders.
- The complete route-tree and app-shell acceptance checklist is evaluated across I4 **plus** I5. Marking
  I4 done means the I1–I3-backed core shell is integrated; it does not claim the complete 60-route target,
  a release candidate, a signed build, or store readiness. P1 remains blocked until I5 and the other
  release prerequisites are complete.

This split preserves every product requirement and the no-placeholder rule while keeping the shared queue
executable. `SCHEMA.md` and the measured production profile remain fully authoritative for both tasks.

## I5 — invite push secrecy (2026-08-25)

`notifications-push.md` §6 allowed a targeted `LEDGER_INVITE` push to carry the one-time invite code,
while the later normative `privacy-and-compliance.md` §1 forbids invite codes in push payloads.
`SCHEMA.md` defines the notification union and parameters but does not require the secret in remote
delivery. The stricter, later privacy contract therefore wins: the code remains only in the authenticated
notification row and its protected route. Remote invite push data contains only `kind` plus non-secret
typed identifiers when applicable; tapping it opens the protected notification inbox, whose local
navigation may read the row route after authorization. No invite code crosses Expo, APNs, or FCM.

## M1 — executable migration safety boundary (2026-08-25)

`migration-plan.md` retained examples in which freeze, import, blob copy, rescue, restore, and rollback
could write without one uniform apply flag. The authoritative `SCHEMA.md` §8.8 and
`scripts/AGENTS.md` require the opposite. M1 therefore makes every external writer a dry run by default;
`--write` or `--apply` is mandatory, and freeze, rescue, restore, thaw, and receipt cleanup require a
second exact confirmation flag. Exports and reports remain confined to ignored `.local/migration/`.

The plan also described `migrationRuns {runId, table, batchIndex, inserted, skipped, failed, at}` as if a
receipt could identify and delete the exact target documents inserted by that batch. Under the frozen
schema it cannot: target rows carry stable legacy keys but no `runId`, and a later run may legitimately
skip rows created by an earlier run. Guessing from creation time or deleting every row in the local file
would not be an exact per-run undo. The lossless Convex snapshot is therefore the normative data rollback.
`migrate.rollback.deleteRun` clears receipts only after the operator explicitly asserts that the snapshot
was restored; it refuses to imply that receipt deletion rolls back data.

The re-parent order named `itemPhotos`, but the frozen schema has no uploader index and the measured
legacy photo rows contain no independent uploader identity. M1 leaves migrated
`itemPhotos.uploadedByUserId` absent—an honest representation requiring no re-parent scan—while adding
the actually resolvable missing stages: `ledgerMemberState`, `ledgerJoinRequests`, and `feedback`.
Adding a deployment-wide photo-uploader scan would violate the authoritative bounded-index rules.

Finally, M1's committed rehearsal corpus is synthetic and tests deterministic normalization, validation,
dry-run defaults, checkpoint recovery, and replay idempotency without copying private data. It is tooling
acceptance only. P1 still owns the required measured-production-data rehearsal on an isolated preview
after E1 provides action-time cloud confirmation and the safe Auth/Storage exports exist.

`migration-plan.md` groups `legacyInvites` with the whole-table replacement strategy, but the frozen
schema supplies neither a stable archive key nor a matching unique index, while the executable P5 pass
is a batch mutation. The measured source bounds this staging table at exactly 357 rows. P5 therefore
deduplicates the complete bounded archive by the lossless `(rawParentKey, rawChildKey)` source identity
inside the mutation. This preserves all 357 children and makes a different-`RUN_ID` replay insert zero
rows without adding an index to the frozen schema or depending on environment-specific document ids.

## P1 — Legacy visual-result authority (2026-08-25)

The initial I4/I5 client used generic cpk-ui defaults for spacing, radii, controls, and navigation even
where `BooKooLegacy/` contained a complete, visually verified product result. The user explicitly made
the Legacy runtime result the first visual authority. For P1 visual reconciliation, the normative order
is therefore: the user's explicit screen feedback, the actual `BooKooLegacy/` runtime/source/assets,
then newer screen documents for functionality that Legacy did not have. This visual order does not
override the measured-data or schema authority stated at the top of this document.

The client keeps the modern architecture, accessibility semantics, five locales, dark mode, tablet
composition, and additional auth providers, but those additions must fit the Legacy visual language:
`#414D6B` chrome, `#1DD3A9` mint, the six Legacy ledger colors, thin pale dividers, full ledger-color
headers, compact settings rows, and the original selected/unselected tab art. Control shape follows the
actual corresponding Legacy surface rather than one blanket radius: flat auth actions remain flat where
Legacy made them flat, color selectors stay circular, and floating completion/actions retain their
24–40-point pill treatment. Text colors may use darker accessible companions where the literal Legacy
foreground fails WCAG AA; the decorative base color remains the Legacy value.

Legacy is authoritative for the user-visible scenario and visual result, not for its obsolete layout or
navigation implementation. The port uses Expo Router and the current typed route tree. It must not copy
`ratio` multipliers, device-specific absolute dimensions, manual status-bar offsets, or Redux navigation
arrays from Legacy; Safe Area insets, flex layout, natural scrolling, and bounded responsive widths must
produce the same composition across current phones and tablets.

The first-ledger scenario also follows Legacy literally: after authentication/onboarding metadata, a
user with no ledger first lands on the `icNoLedger` empty state and explicitly chooses **Add ledger**;
Expo Router then opens the separate ledger editor. Legal checkboxes are not part of that editor. The
signed-out continuation notice is the disclosure/attestation surface, including the 14+ statement, and
the server persists its versioned legal events when the user completes the first-ledger step. Legacy's
ledger title and description inputs are borderless; cpk-ui's default underline is explicitly removed.

One user-visible accessibility correction overrides the literal Legacy palette: the original yellow
`#EED100` makes white field text unreadable. The light yellow ledger surface is therefore the deeper
gold `#C09A00`, and that surface alone uses Legacy navy `#292767` for text and controls. The pair reaches
4.98:1 while remaining recognizably the yellow option instead of turning brown.

The signed-out cold-start path restores the three-page Legacy Tutorial before Intro/sign-in. The
tracked logo, tutorial, and tab PNG scale sets are byte-identical copies from the read-only Legacy tree;
the source tree itself remains untouched. The fifth add pseudo-tab is the only new tab asset and is a
compact mint plus placed between Legacy tabs 2 and 3. G15 remains unchanged: transaction-category art
continues to use typed cpk-ui icons rather than copying the Legacy category PNG inventory.

## P1 — sign-in hierarchy and development QA OTP (2026-08-25)

The user's sign-in hierarchy supersedes the first P1 draft: email must not be an expanded form on first
arrival. Email, Apple, and Google are three equal full-width primary choices. Choosing email then reveals
its address field and send action. Kakao and Naver remain fully supported but sit below as circular,
brand-marked secondary actions so five providers do not overpower the Legacy composition.

For development QA only, the exact server environment `ENVIRONMENT=development` maps every normalized
email OTP request to `68686868` and suppresses delivery. The match is exact rather than “anything except
production”; preview, missing, typoed, and production environments do not receive the bypass. The
separate app-review email allow-list remains unchanged and production can never accept the development
code through this path.

## P1 — no-ledger status area and dashboard (2026-08-26)

The Legacy no-ledger menu icon is an actual dashboard trigger, not decorative header art. Its current
Expo Router port opens a responsive left-side dashboard containing the authenticated profile and the
Add ledger destination; close, outside-dismiss, and Add ledger are all interactive. A user with no
ledgers has no fabricated ledger rows. The drawer uses natural Safe Area insets, flex sizing, and an
84%-width/360-point maximum instead of copying Legacy's `openMenuOffset`, ratio multiplier, or screen-
specific coordinates. The close and profile-placeholder scale sets are byte-identical copies from the
read-only Legacy tree and remain regression checked.

The no-ledger mint header now owns the top Safe Area/status region as one continuous `#1DD3A9` surface
with dark status content for contrast; the pale page background still owns the left, right, and bottom insets. The
shared screen primitive exposes a separate top-status background only for surfaces that require this
split, preserving existing full-surface status behavior everywhere else.

## P1 — public BooKooOpen colour registry (2026-08-26)

The user designated the public `hyochan/bookooopen` theme as the colour reference while retaining the
actual BooKooLegacy result as the first authority for scenarios, composition, and visual character.
The exact public registry is therefore canonical for named brand tokens: main `#1DD3A9`, dusk
`#414D6B`, pale grey `#DDE2EC`, white grey `#F9FBFD`, red `#E6677E`, orange `#F6A623`, yellow
`#EED100`, green `#24CD97`, blue `#679EFF`, purple `#B669F9`, carnation `#FF728D`, medium grey
`#869AB7`, cloudy blue `#AFC2DB`, Apple `#000000`, and Google `#E04238`. This corrects the earlier
one-digit `#1DD3A8` mint transcription. Provider-owned Kakao/Naver colours and accessible foreground,
link, dark-surface, and state companions remain semantic tokens rather than pretending to be entries in
that public palette. The prior user-directed yellow accessibility exception remains binding: ledger
yellow uses `#C09A00` in light mode because literal `#EED100` cannot carry the required text contrast.

## P1 — release branch, public-site, and Tier-3 evidence contracts (2026-08-26)

### Main-only integration does not identify a release

The user replaced the earlier `main`/`develop` topology with one integration branch plus short-lived
task branches. The release document and CI trigger now follow that explicit decision: CI pushes run on
`main`, and there is no `develop` branch. This changes no release proof. A verified annotated version
tag, signed build identifiers, exact production backend, policy hashes, store records, and private
manifest are still required; a commit merely being on `main` is not release evidence.

### Public legal/support pages are generated candidates, not deployed proof

The app's versioned legal events require public documents with byte-stable hashes, while the store
contract additionally requires support, privacy-rights, and external account-deletion URLs. P1 therefore
owns one deterministic five-locale static source that generates `/legal/privacy`, `/legal/terms`,
`/legal/versions`, `/privacy-choices`, `/account-deletion`, `/support`, and the `/invite` fallback. The
committed hashes in `shared/legal.ts` match the generated Korean controlling copies. Firebase Hosting
configuration targets the user-created `bookoo-90f0a` project but is configuration only: no URL is
called live, no deployment is claimed, and publication remains blocked on the actual production Convex
region, final operator/listing identity, and Korean legal review.

Store metadata uses the same canonical localized URLs and contains five locales plus eight deterministic
scene descriptions. The 71 development storyboard captures remain design/route evidence, not store
screenshots. Store screenshots must be recaptured from the exact signed release binary after P2 supplies
signing and store records; a development build cannot be relabelled as release evidence.

### Frozen load fixture supersedes the earlier 5-year/40-category default

`SCHEMA.md` states one load target for every budget: 100,000 items, ten years, eight concurrent writing
members, 120 categories, 5,000 photos, and `ROLLUP_SHARD_COUNT = 1`. The earlier research example and I3
seed defaults used five years and 40 categories. The measured production profile contains no fact that
reduces the frozen synthetic target, so SCHEMA wins. New preview seeds and the real-budget assertion now
default to ten years and 120 categories. The dated I3 local run remains truthful evidence for its exact
5-year/40-category fixture; it is not retroactively described as proof of the larger P1 fixture.

The P1 Tier-3 driver is dry-plan-only unless an existing isolated non-production deployment, `--run`, and
two explicit synthetic/isolation confirmations are supplied. It drives the eight seeded identities through
the real public `items.create` mutation, records only aggregate latency and redacted error classes under
ignored `.local/`, and can generate the dated secret-free report. SCHEMA §5.4 remains the pass authority:
no sustained Convex Health conflict insight and no material p95/p99 regression attributable to retries.
Because the approved tooling exposes neither an exact retry count nor an OCC rate, no report may invent
one; a pass additionally requires a reviewed Health/Functions window.

## P1 — real Expo Router ledger Drawer (2026-08-26)

The user's explicit correction supersedes `client-ia.md` D1's earlier “no drawer” decision for the
ready ledger shell. The left ledger surface is navigation state, not a view styled to resemble it:
Expo Router's `Drawer` now wraps the existing bottom-tab group, producing the hierarchy
`Stack → Drawer → Tabs`. The former header-owned transparent `Modal` and hand-built backdrop are
removed. The hamburger and ledger title dispatch the same parent Drawer action, while the navigator
owns backdrop dismissal, system-back behavior, focus/accessibility containment, and the UI-thread
open/close gesture.

The custom Drawer content keeps the current data contract: `useActiveLedger`/`listMine` supplies a
virtualized `FlashList`, selecting a ledger updates the active id and closes the Drawer, and Add ledger
closes before navigating to `/ledgers/new`. It uses an 84%-of-viewport width capped at 360 points,
continuous trailing corners, an explicit top/left/bottom Safe Area for custom Drawer content, and
theme/cpk-ui tokens; none of Legacy's ratio multipliers or manual navigation arrays are copied.
BooKooLegacy remains the visual and
journey reference, while Expo Router owns the implementation as the user required.

## P1 — per-ledger settings hierarchy (2026-08-27)

The supplied Legacy `Tab4` result is the visual authority for the per-ledger settings index: one
ledger-coloured header followed by compact, divided rows. The user's explicit correction fixes its surface
ownership: the existing bottom `More` tab is the active ledger's settings index, never a profile/general-
preferences page. The same shared composition also remains reachable at `/ledger/[id]/settings` from an
individual ledger's Drawer `more` action. Expo Router still owns both presentations: the tab variant uses the
standard hamburger/title ledger chrome, while the pushed variant uses stack back navigation. Ledger title,
description, and colour editing stay on a dedicated child route so the index remains scannable; membership,
invitations, categories, photos, recovery, audit, and danger controls remain available in grouped rows below
the Legacy preference set.

The Legacy-looking controls do not override the frozen data contract. Currency is still an OWNER-only
per-ledger value, and SCHEMA §7.3/§11 only permits changing an empty ledger or confirming an assumed
migrated currency. Language remains a global profile preference even when entered from this screen.
The screenshot's `Repeat` switch is intentionally absent because SCHEMA §11 lists recurrence rules as a
v2 seam with no v1 table, mutation, or materialisation cron; presenting a switch would falsely promise
persistence. Likewise, the screenshot's email-address/Excel delivery flow is not restored: SCHEMA §6 and
§11 require an ADMIN+ protected, expiring ledger export request, while scheduled delivery and additional
formats remain v2. The index therefore requests the existing protected export directly and never accepts
or exposes a raw delivery address or URL.

## P1 — Drawer app-settings hierarchy (2026-08-27)

The Drawer gear exclusively opens a dedicated `/settings` route rather than redirecting to the bottom
`More` tab. Its first group preserves BooKooLegacy's actual settings order—announcements, feedback, FAQ,
notifications, and app lock—using compact divided rows on one naturally scrolling surface. The user's later
correction removes Appearance, Language, Default currency, Privacy, and About from this compact index so it
does not duplicate ledger-facing settings; account management, logout, and version remain. Currency and
Language stay visible in the active ledger's `More` composition. This information-architecture placement does
not alter the frozen model: `ledgers.baseCurrency` is the ledger authority, `userProfiles.preferredCurrency`
continues only as a new-ledger prefill, and Language remains the global profile/UI preference required by D3.
The grouped continuous cards, semantic cpk-ui colours, 44-point-or-larger targets, typed Expo Router
destinations, and light/dark variants replace Legacy's fixed ratio multipliers and manual navigation state
rather than copying them.

The supplied Legacy montage includes Change Password, but the current authoritative auth contract has
no password credential: sign-in is email OTP plus Apple/Google/Kakao/Naver, and linked identities are
managed through the account screen. A password row would therefore be a dead or misleading control and
is replaced by Account, where linked providers, sign-out, recovery-period deletion, and external deletion
help already follow the frozen account lifecycle. App lock remains a child route rather than a cosmetic
switch because enabling it requires creating and confirming the encrypted six-digit PIN; disabling it
requires the themed confirmation flow. Pending-write logout confirmation likewise uses the shared themed
dialog instead of restoring Legacy's unguarded local sign-out.

## P1 — Monthly calendar navigation and viewport fill (2026-08-27)

BooKooLegacy's rendered Monthly journey is the visual and interaction authority for the calendar chrome:
the month label is prominent and tappable, its disclosure opens an exact-date picker, and the adjacent
previous/next controls move one month. The current implementation keeps the shared cpk-ui `Calendar`, Expo
Router shell, typed ledger-day codecs, six-week grid, swipe paging, and bounded query window; it does not copy
Legacy's fixed screen ratios, manual offsets, or removed date-picker dependency. The picker is a themed shared
dialog containing a second non-swipe cpk-ui Calendar, which prevents neighbouring pager pages from showing in
the compact modal while retaining its own month buttons and exact-day selection.

The lower viewport follows the user's explicit correction rather than the older visual-language empty-state
copy: both empty and populated days use one flex-growing `FlashList` surface coloured with `theme.bg.basic`
through the tab bar. Empty days remain a single quiet line and never add a duplicate creation button. Light
and dark modes use the same semantic tokens; the month trigger and separate 44-point rounded arrow controls
remain readable and operable in both themes.

The user's subsequent on-device comparison supersedes the initial `expanded` Calendar preset for the primary
Monthly grid. A 56-point cell produced only an approximately 38-point selected/today circle and left the
36-point visual reference under-emphasized. The primary grid therefore uses cpk-ui's supported numeric
68-point cell, yielding an approximately 46-point true circle, while the compact date-picker keeps its regular
geometry. The month title uses the 36-point design-system Title style. The ready Monthly route also owns a
`theme.bg.basic` outer screen frame, and its final scroll inset is calculated from the shared 56-point bottom-
tab base plus the current Safe Area; this removes the paper-coloured tail and prevents the last item from
sitting underneath the native tab bar without reintroducing BooKooLegacy ratio math.

## P1 — branded waiting state and calendar type density (2026-08-27)

The native cold-start splash remains the exact BooKooLegacy `splash.png` result, but replaying that full-bleed
image during every internal route or query wait made normal navigation look like another app launch. Internal
waiting now has one shared language: the transparent BooKoo wordmark, cpk-ui's `LoadingIndicator`, and a quiet
mint progress rhythm on the current semantic surface. Screen, section, and inline variants replace every
former rectangular skeleton and the member pager's raw loading label. Composite Monthly, List, and Stats
screens render only one loader rather than duplicating it in each pane. The exported `ScreenSkeleton` name is
retained temporarily only as a compatibility adapter for existing callers; it no longer draws skeleton rows.

The wordmark motion uses the existing Reanimated UI thread and only opacity/transform, with a 900 ms symmetric
breath and a fully static reduced-motion state. A Lottie dependency and generated JSON were intentionally not
added: the requested logo-like motion is smaller and more reliable with the runtime already in the app, while
preserving accessibility busy/live announcements and light/dark parity. This is an internal wait treatment,
not a replacement for the native Legacy splash.

Fresh simulator evidence then superseded the preceding 36-point calendar-title decision without changing the
confirmed geometry. The primary cell remains 68 points and its selected/today circle remains approximately 46
points. Only typography is reduced: the month label uses the 28-point Heading1 token, date numbers use 18
points, and weekday labels use 14 points. This separates tap geometry from type scale and removes the enlarged
look without weakening the selected-day target.

The same simulator comparison distinguishes the ledger identity from the calendar scale. The expanded mint
surface now uses the 24-point bold Heading3 token for the ledger title, one step above the former Heading4,
while the collapsed 56-point chrome uses the 20-point bold Heading5 token instead of Body2. This is a token
swap inside the existing cpk-ui `ParallaxHeader`: its UI-thread crossfade/translation, responsive geometry,
and reduced-motion behavior remain unchanged, and no scroll-derived font-size animation or Legacy ratio math
is introduced.

## P1 — compact shared mode selector density (2026-08-27)

The user's List and Stats simulator comparison supersedes the taller raised selector treatment. Both routes,
plus any form already using the same wrapper, keep one `BookooSegmentedControl` rather than acquiring local
screen styles. Its visual rail is 44 points and its inset selected capsule is 36 points with 14-point cpk-ui
Body3 labels. The former 52-point rail and legacy elevation/shadow are removed because they made this
secondary filter compete with the ledger header and monthly summary.

The visible capsule is allowed to be smaller than the interaction target: every tab remains a full 44-point
Pressable with tab semantics, selected state, inverse selected foreground, token-owned light/dark colours,
and pressed feedback. This preserves the accessibility rule while making the control visibly sharper; no
screen ratio, raw colour, second component system, or route-specific List/Stats fork is introduced.

## P1 — cpk-ui upstream-first component ownership (2026-08-27)

The user's explicit cross-project ownership rule supersedes the earlier allowance for a reusable BooKoo-local
wrapper to implement its own visuals. Every data-agnostic control and visualization—including segmented/
section controls, pie/donut/bar/line charts, chart frames and legends—belongs in the open-source
`crossplatformkorea/cpk-ui` package. If its current API or rendered result does not meet BooKoo, the upstream
component is extended or rewritten; BooKoo does not copy it or create a competing generic implementation.

BooKoo still owns ledger-specific composition: converting bounded server rollups into generic series,
formatting money and localized accessibility summaries, enforcing role gates, and connecting Expo Router.
Third-party engines such as Victory, Skia, or SVG may back cpk-ui, but new BooKoo feature screens cannot import
them directly to build reusable visuals. Every upstream primitive requires a public export, types, colocated
tests and Storybook stories, light/dark and reduced-motion behavior, native/web review, `bun run test:all`, and
`bun run build`. Local `bun link --no-save` is QA-only; committed BooKoo state must pin an exact published
version, and package publication remains an action-time authorized external operation.

Two existing bridges are recorded rather than falsely described as compliant: the local
`BookooSegmentedControl` must become a cpk-ui `SegmentedControl` capsule variant, and Stats' direct
`victory-native` donut must become cpk-ui chart primitives before the reusable-UI promotion sweep is complete.

## P1 — Legacy-ranked Stats series palette (2026-08-27)

The user's supplied Legacy Stats result and the read-only `BooKooLegacy/src/components/screen/Tab3.tsx`
palette supersede the interim rule that a donut slice should directly inherit each category's stored icon
colour. Category colours remain stable data tokens for category picking and editing, but ranked Stats series
now prepend the active ledger colour and continue with Legacy's cloudy blue, carnation, orange, yellow, mint,
blue and purple sequence. This prevents arbitrary category combinations from producing adjacent muddy green/
brown slices and keeps the ring, row icon outline and proportional line visually identical.

The light series uses the exact public BooKoo swatches; dark mode uses coordinated, distinguishable companions
from the existing category canvas palette. This is a presentation-only mapping: rollup order, top-seven-plus-
Other aggregation, money signs, schema category tokens and migrated data do not change. The generic donut
renderer remains recorded cpk-ui promotion debt; BooKoo owns only this ledger/rank-to-colour domain adapter.

## P1 — exact touch geometry and Legacy entry composition (2026-08-27)

The rendered BooKooLegacy entry journey is the visual authority for this pass, while the frozen current
schema and transaction contract remain authoritative for data. Entry create/edit therefore keeps integer
minor-unit money, explicit refund semantics, category ids, local-day/time conversion, memo, place/photo
links, optimistic outbox handling, edit-conflict recovery, and the current 20-photo limit. Only its
presentation changes: Expo Router presents a full-screen modal with a minimal close header, underlined
Income/Consume tabs, plain amount and information rows, compact circular category choices, compact photo
tiles, and a full-width fixed Save bar. Legacy's fixed screen ratios, local navigation state, and obsolete
field assumptions are not copied.

The user's interaction evidence also makes visible pressed geometry part of the component contract. Drawer
ledger rows are two exact, non-overlapping full-height partitions: the left edge-to-partition region selects
the ledger and the partition-to-right-edge region opens that ledger's settings. The installed cpk-ui
`CustomPressable` treats numeric `0` hit slop as falsy, so BooKoo passes an explicit four-sided zero object to
prevent either action from borrowing its neighbour's space. Header menu/add actions use the same exact hit
geometry and clip their underlay to a 56-point circle.

cpk-ui's current Calendar draws its pressed underlay on the rectangular outer cell but draws selected/today
state on the circular inner pill. Until the upstream primitive exposes a selection-shaped press surface,
BooKoo uses its supported transparent day-underlay colour and leaves the committed selected/today feedback
as the only visible state. This removes the misleading tall rectangle without forking or copying the Calendar.
The cpk-ui checkout stays read-only in this pass; promoting exact selection-shaped Calendar press feedback
upstream remains explicit component debt under the upstream-first ownership rule.

## P1 — Monthly calendar vertical density correction (2026-08-27)

The user's fresh simulator crop supersedes the preceding 68-point primary Calendar size decision. Its selected
circle was readable, but cpk-ui correctly derived an approximately 78-point week row from that size, leaving
too much vertical space between dates. Monthly now uses the component's public numeric `size` API at 60 points:
the derived row is approximately 68 points, the selected pill remains approximately 41 points, and BooKoo's
existing 18-point date and 14-point weekday typography overrides stay unchanged. This is intentionally between
cpk-ui's regular and expanded presets, so it does not return to the earlier under-emphasized 38-point pill.

No Calendar rendering or ratio math is copied into BooKoo, and the cpk-ui source checkout is unchanged. The
shared Calendar still owns swipe paging, six-week geometry, hit targets, markers, selected/today states, and
native/web behavior; BooKoo supplies only the supported semantic size and its ledger-specific composition.

## P1 — Legacy entry workflow and optional place capture (2026-08-27)

The user's explicit product decision supersedes the earlier G24/R6 launch deferral of new place capture.
`SCHEMA.md` remains authoritative: an entry stores at most one inline
`place: {label, lat, lng, address?, countryCode?}` object. No `places` table, geospatial index, raw provider
payload, location history, or background tracking is introduced. Search, map tap, and current-position lookup
exist only inside the user-opened place picker; current-position permission is optional and revocable, and
refusing it does not block manual financial entry.

The rendered BooKooLegacy journey remains the visual and interaction authority while the current Expo Router,
Convex, outbox, and integer-money contracts remain structural authority. Entry create/edit therefore uses a
minimal full-screen route, a compact underlined Income/Expense tab pair, horizontal swipe between those two
states, a native decimal keyboard instead of the retired calculator/refund surface, separate category and
custom-category routes, native date/time selection, a separate searchable map picker, compact private-photo
tiles, and a fixed full-width Save bar whose background owns the bottom safe-area inset. Existing negative
migrated/edited values retain their sign invisibly on edit; new input is positive and classified by the chosen
Income/Expense type.

This override also supersedes public and release copy that said BooKoo never requests location permission or
collects new coordinates. Privacy/store declarations must describe optional precise place attachment, user-
initiated OS permission, map/geocoder provider processing, no background collection, and deletion with the
entry. Production release remains gated on Korean privacy review, final Apple/Google Maps terms and overseas-
processing disclosure, restricted production API keys, and synchronized App Store/Play Console answers.

## P1 — interaction-linked indicators and stable waiting position (2026-08-27)

The user's latest device evidence supersedes two incidental implementation choices. First, a selected
Income/Expense underline cannot teleport only after a swipe commits: while the horizontal gesture is active,
one absolute childless indicator follows normalized gesture progress on Reanimated's UI thread, clamps to the
two tabs, and then settles to the committed state. The 44-point tab hit targets remain larger than the visible
64-point line, so compact styling does not reduce accessibility. The amount `EditText` also overrides the
actual outer cpk-ui container border; styling its inner input wrapper never removed the rendered underline.

Second, `ScreenSkeleton.rows` no longer selects inline versus section geometry for route/query waits. That
compatibility parameter had allowed the same wait to jump vertically between screens. All `ScreenSkeleton`
callers now use the full-scene loader with a fixed 80-point upward visual bias, while explicit pagination keeps
the direct inline loader. Monthly tightens the cpk-ui numeric Calendar size from 60 to 56 and uses disabled text
for its one-line empty-day copy. These are presentation overrides only: Calendar paging/selection and loading
accessibility remain owned by cpk-ui, and no Legacy ratio math or Lottie dependency is introduced.

## P1 — contextual ledger colour and successful-form exit (2026-08-27)

The user's device evidence resolves two presentation/flow ambiguities without changing schema or mutation
contracts. A ledger's `colorKey` remains the authoritative persisted identity, and its existing light/dark
`LEDGER_ACCENTS` pair now supplies the contextual primary role for every non-destructive ledger action and
selected control. Semantic danger, warning, disabled, success, and validation colours retain their meaning.
During ledger editing, the draft colour temporarily overrides the active provider for the header and Update
CTA, so the preview is internally consistent before the mutation commits.

The same correction establishes a completion rule for single-purpose forms: after the awaited mutation
succeeds, Expo Router immediately pops the form; mutation failure leaves it visible with an error. A form
opened as a deep link replaces to the owning ledger More surface when no history exists. This supersedes the
incidental stay-on-screen behavior in ledger details and time-zone editing, but does not apply to inline
collection administration where repeated updates on the same screen are the intended workflow.

## P1 — entry prompt contrast and modal safe-area chrome (2026-08-27)

The user's latest simulator evidence supersedes the incidental use of normal placeholder contrast and a
zero-origin close row on entry create/edit. Empty amount affordances now use the semantic disabled-text token
for both the leading sign and the native TextInput placeholder; entered money still adopts the active ledger
accent. The full-screen modal's custom header consumes the live top Safe Area inset before its 48-point close
row, so status-bar and Dynamic-Island geometry are never inferred from a screenshot or device ratio. This is a
presentation-only correction: currency parsing, integer minor units, categories, mutations and Expo Router
ownership are unchanged. Monthly keeps the reconciled BooKooLegacy marker rule: populated, unselected dates
show a dot, while the selected pill suppresses that redundant marker.

## P1 — single-action Drawer ledger rows (2026-08-27)

The user's current navigation decision supersedes the earlier Drawer partition rule and the per-ledger
settings hierarchy's Drawer-`more` entry. The active ledger's bottom `More` tab now owns routine per-ledger
settings, so repeating a `more` action in every Drawer row adds ambiguity without adding a destination.
Each Drawer ledger row is therefore one exact, full-width selection target. Its pressed geometry, accessibility
selection state, and visible background share the same bounds; the selected row fills the complete width with
that ledger's subtle light/dark accent and retains the small inverse check on its icon. Selecting any row sets
the active ledger and closes the Drawer. The Drawer gear continues to own general app settings, while the
existing `/ledger/[id]/settings` route remains available to deterministic navigation without being duplicated
as a per-row Drawer affordance. This is a navigation/presentation correction only; ledger permissions, active-id
storage, settings data ownership, and schema are unchanged.

## P1 — authenticated photo viewer and category line trend (2026-08-27)

The supplied BooKooLegacy evidence resolves the remaining photo/detail and Stats drill-down presentation.
`SCHEMA.md` and the private-media reconciliation remain authoritative: every rendered receipt still resolves
through the authenticated id-based media route, and only the original variant is requested inside the explicit
viewer. All entry-detail, entry-edit, item-gallery, and ledger-gallery thumbnails navigate to one Expo Router
full-screen modal at the correct item-relative index. The black viewer uses cpk-ui `PinchZoom` for UI-thread
pinch/pan with bounded 1–4× scale; PagerView owns horizontal movement at 1× and pauses while the active image is
zoomed. This adds no public URL, cache persistence, analytics event, or device-library mutation except the
existing explicit Save action.

The Legacy category-detail graph is restored as a semantic 12-month drill-down rather than a decorative bar
placeholder. Convex `categoryTrend` remains the bounded aggregate authority; an expense category plots the
absolute expense rollup and an income category plots the absolute income rollup. Selecting a point changes the
paginated month entry list below it. Generic SVG geometry, selected tooltip, dense target partition,
accessibility state and empty/single/multi rendering live in the open-source cpk-ui `LineChart`; BooKoo retains
only ledger/category mapping, currency formatting, theme colour and routing. Until that cpk-ui branch is
published and BooKoo pins its exact version, the integration is local QA state and must not be committed with a
`file:`/`link:`/absolute-path dependency.

## P1 — live private-photo upload and entry discussion (2026-08-27)

Live iOS QA supersedes the unverified assumption that a React Native `fetch(fileUri).blob()` body is portable
for image-picker assets. On the current Expo/iOS stack that path reached the Convex upload URL with an
unusable body and surfaced “This file could not be uploaded.” BooKoo now reads the selected and generated
thumbnail files through Expo FileSystem and performs its foreground native upload after checking existence and
size. A successful 2xx response must decode to a Convex `storageId` before the existing private photo claim
mutation runs. The authenticated media id, purpose binding, original/thumb separation, deletion contract and
schema remain unchanged.

The black photo viewer also consumes the live top Safe Area before its compact close/zoom/save/delete row.
This resolves the observed Dynamic Island overlap without copying device ratios. Live QA verified a newly
uploaded receipt thumbnail, authenticated original viewer, imperative zoom, and authorized action set; no
public URL or persistent unauthenticated cache was introduced.

The supplied Legacy comment evidence resolves entry-detail composition only. Existing SCHEMA comment bodies,
soft deletion, blocked-relationship projection, reporting, pagination and live-query authorization remain
authoritative. Entry detail now renders avatar/author/time/body rows, own-delete and non-own-report controls,
plus a ledger-accent circular send control. A successful mutation clears the composer and Convex subscription
updates authorized clients. This is not approval to weaken authentication or to expose a fixed OTP: synthetic
multi-account QA remains separate from the production auth contract.

## P1 — cursor-paginated growing lists and CI asset provenance (2026-08-27)

The user's release audit makes the root `AGENTS.md` list rule operational for every growing server-backed
surface: a screen list uses a Convex indexed cursor, `usePaginatedQuery`, `FlashList`, and `onEndReached`;
it never downloads an account collection in bulk or renders it through `ScrollView + map`. The ledger
switcher uses 20 rows per page, preserving `SCHEMA.md` §4's frozen 60-document page budget (membership,
ledger and member-state point reads). Invites and feedback history use 20-row pages. Contract-bounded
catalogs and previews—such as at most 120 categories or 20 photos on one entry—retain named sentinel caps
and are not reclassified as unbounded feeds.

`BooKooLegacy/` remains an ignored, read-only workstation reference and is never required by a clean CI
checkout. Regression tests always verify the complete tracked runtime asset set against a stable aggregate
digest, then additionally compare it byte-for-byte with the ignored Legacy source only when that local
reference exists. This preserves visual provenance without adding the Legacy tree to Git or making CI depend
on an intentionally untracked directory.

## P1 — additive Convex pagination contracts (2026-08-27)

Read-only inspection of the connected development deployment showed that released clients still call the
array-returning `ledgers.queries.listMine`, `feedback.queries.mine`, `invites.queries.list`,
`invites.queries.received`, `reports.queries.mine`, and `ledgers.queries.roster` contracts. Replacing any of
those validators or return shapes in place would break an installed client during a staggered app/backend
rollout. Pagination therefore evolves additively: the legacy names remain hard-capped compatibility reads.
The current UI uses `listMinePaginated`, feedback `minePaginated`, invite `listPaginated`, and
`rosterPaginated`; `receivedPaginated` and report `minePaginated` are additive cursor contracts for the next
consumers. New growing UI must use only the cursor APIs; the bounded legacy functions exist solely for rollout
compatibility and must not be adopted by new screens.

Invite expiry is narrower than the indexed active/revoked range, and ledger membership rows may temporarily
outlive a deleted/orphaned ledger, so a server cursor page can become empty after authorization-safe filtering.
The affected screen advances across a requested empty visible page, but stops as soon as a page contributes a
visible row or the cursor is exhausted. This preserves incremental loading without hiding a valid row behind
an expired or stale-only page.

## P1 — Free/Pro replaces Together and the no-ad launch baseline (2026-08-28)

The user's product correction supersedes the earlier Together-only/no-ad decision. The public model is now
Free and Pro: Free retains the complete core ledger with one restrained, non-personalized monthly-summary
banner; Pro removes ads and retains the household collaboration capabilities. One payer funds the active
ledger, so invited members of a Pro owner also see no ads. A Community tier for 100+ members remains deferred
until real demand exists.

The following sources are reconciled to that decision: `docs/product/MONETIZATION.md`,
`shared/entitlements.ts`, the RevenueCat contract, store metadata, public privacy copy,
`privacy-and-compliance.md`, `observability.md`, and `release-and-store.md`. The shipping identifiers
are entitlement `bookoo_pro`, iOS products `dev.hyo.bookoo.pro.monthly|annual`, group `bookoo_pro`, and Play
subscription `pro`. Previously created Together records are prelaunch legacy configuration and do not
authorize reusing the 2017 app's identifiers.

Advertising is not a rollback of the financial-data boundary. Google Mobile Ads/UMP may process the limited
technical and advertising data disclosed by their current SDK documentation; BooKoo blocks Android
advertising-ID permission, does not request iOS ATT, requests non-personalized ads, and never passes ledger
content or account profiles. RevenueCat receives only the closed ad lifecycle/revenue vocabulary. Any new ad
placement, format, mediator, or personalized targeting reopens privacy, design, store, and consent review.

### Launch Pro boundary correction (2026-09-01)

The phrase “household collaboration capabilities” above is too broad and is superseded by this exact launch
boundary. Free owns one ledger, supports two members, and keeps entries, photos, comments, statistics and
export complete. Pro removes ads for the owner-funded household, permits additional owned ledgers, and raises
each new ledger to an absolute five-member maximum. The second-ledger create mutation and member expansion
mutations enforce those limits on the server; a sixth member is a limit error, not a new paywall. Migrated
legacy ledgers retain the existing member-limit grandfathering rule. Reserved future capabilities cannot
appear in the entitlement vocabulary, paywall, announcements or store copy until implemented and enforced.

## P1 — Martie-style banner footer supersedes Monthly placement (2026-08-29)

The user's explicit correction supersedes the Monthly-summary placement selected during the Free/Pro launch
work. BooKoo now follows Martie's current navigation composition: all four authenticated root tabs share one
footer after the tab navigator, so the anchored adaptive banner appears below the bottom tab bar and
immediately above the device's bottom Safe Area. The tab bar relinquishes its bottom inset to that footer,
preventing duplicated home-indicator padding. Monthly no longer owns an ad inside its calendar or entry
composition. Martie's fixed 468-point `FULL_BANNER` size is not copied because live iPhone QA proved that it
clips both sides; the attached historical Martie screen likewise shows a phone-width adaptive creative.

The Martie runtime behavior is adopted with BooKoo's stricter product and privacy gates intact. The native
banner stays mounted while eligible, collapses to zero height until loaded, retries failures with capped
exponential backoff, and reloads a missing banner when the app returns to the foreground. BooKoo continues to
request non-personalized ads, waits for consent and both viewer/ledger entitlement checks, uses only BooKoo's
own AdMob ids, and reports the renamed `tab_shell_banner` placement to RevenueCat. Pro, unresolved, non-tab,
and no-active-ledger states retain no advertising slot beyond the required bottom Safe Area.

## P1 — settings and Pro become staged task flows (2026-08-29)

The user's supplied review sheets supersede the earlier settings and paywall compositions. The evidence
showed too many button-like controls at equal emphasis, generic empty states, a PIN and confirmation field
competing on one page, and plan selection sitting immediately beside purchase. The current design therefore
uses a shared settings vocabulary but does not force unrelated work into one view.

PIN creation is now `create -> confirm` state replacement with one secure field, one six-dot indicator, and
one progress cue. Existing-lock preferences remain a separate management view; changing biometrics or
auto-lock never replaces the saved PIN. Account deletion opens an in-page impact review instead of stacking
native confirmation dialogs. Theme, language, currency, notifications, account, About, FAQ, feedback,
announcements, privacy, diagnostics, and operator-denied screens now use contextual hierarchy and copy.

Pro now separates `overview -> plan selection -> final review -> native App Store confirmation`. A plan card
only updates radio selection. The first potentially billable action appears on the separate review state with
the live RevenueCat price and period, trial/cancellation disclosure, legal links, and a route back to change
plans. Live iPhone evidence is stored in `docs/debugs/contact-sheets/06-settings-redesign.png` and
`docs/debugs/contact-sheets/08-pro-redesign.png`; automated tests cover PIN confirmation and the fact that
neither plan selection nor entering review calls purchase.

The same simulator pass exposed a stale-development-client failure mode: importing Google Mobile Ads could
throw before any app UI rendered when the installed binary predated that native module. Ad imports are now
runtime guarded and degrade to no ad in that binary, while current production/native builds continue to load
the bundled SDK. Advertising can no longer prevent the ledger or settings from opening.

## P1 — native header density and quiet destructive actions (2026-08-29)

The user's second visual correction supersedes the roomy hero treatment in the first redesign pass. Live
iPhone inspection identified the structural source of the excessive gap: stack routes were nested inside a
second full-screen Safe Area wrapper even though Expo Router's native header already owned the top inset.
Settings content now uses the stack's scene bounds directly and begins with a compact icon-and-description
line twelve points below the header. The route title is not repeated inside content; only step-specific titles
such as `Create your PIN`, `Review your plan`, and `Delete account` remain visible within the page.

Logout and pre-confirmation account deletion no longer use filled red icon blocks. They are quiet, centered
text actions inside neutral grouped surfaces, reserving the filled danger treatment for the final deletion
button after the recovery and shared-record consequences have been reviewed. About uses a compact horizontal
identity row rather than a vertically centered brand monument. These rules apply across the full settings
family, including FlashList-backed privacy and feedback routes, which now share the same stack-owned inset.

The Pro overview is also compacted: one short identity line, a single three-row benefit group, and two
side-by-side radio cards lead to an invoice-like final review. The overview contains no oversized decorative
hero, and the final screen contains only plan, localized price/period, trial or cancellation condition, legal
links, and the single purchase CTA in the safe-area footer. Live evidence is in
`docs/debugs/contact-sheets/06-settings-redesign.png` and
`docs/debugs/contact-sheets/08-pro-redesign.png`; capture stopped before logout, PIN creation, account deletion,
or App Store purchase.

## P1 — Legacy content coverage becomes current native detail pages (2026-08-29)

The user's request to compare the rebuilt app with BooKooLegacy resolves content coverage, not historical
publication state. Legacy contained nine hard-coded announcements and eleven FAQ questions. The old
announcements describe a discontinued 2017 application and must not be republished as current news. The new
app therefore seeds three dated 2026 notices—new-app identity, Free/Pro launch, and privacy/control—and
reconstructs all eleven Legacy FAQ topics plus three current purchase, privacy and old-app questions. Every
item has complete Korean, English, Japanese, Simplified Chinese and Indonesian copy. Convex
keys are stable and the seed is additive/idempotent so an operator-edited row is never overwritten.

Settings now exposes every existing destination rather than leaving appearance, language, currency, privacy
or About as route-only surfaces. Announcements open one native detail route; FAQ expands one answer in place.
About links to native Terms, Privacy, document history and Support. Privacy and data links to privacy choices,
and Account deletion links to the full deletion guide. All six native legal/support documents render from the
same reviewed copy that generates the public site, so app and web cannot silently drift. A document-key change
remounts the scroll surface at the top instead of inheriting the previous policy's position.

The content audit also supersedes the stale legal statement that placed advertising below the monthly
summary. Every locale now describes the actual restrained Free banner immediately below the four main tabs
and the Pro subscription terms. Internal candidate-only publication notes were removed from user-visible
version history without claiming a legal review that has not been evidenced. Legal version `2026-08-29` and
the pinned Korean Terms/Privacy hashes are regenerated from the canonical source.

## P1 — single primary actions own the bottom Safe Area (2026-08-29)

The user's latest attached currency reference and live keyboard review supersede the incidental rounded,
inset footer buttons left in settings, Pro and ledger administration. Whenever a screen has exactly one
completion action, that action is now one shared edge-to-edge bar outside the scroll owner. The button surface
has no side inset or corner radius and itself paints the device's bottom Safe Area. Quiet cancel, change-plan,
or escape actions stay in content; multi-action dialogs and destructive choice groups remain exceptions because
they do not have one unambiguous completion action.

Native `KeyboardAvoidingView` behavior was insufficient inside the current Expo Router scene hierarchy: live
iPhone QA showed Feedback's Send bar hidden behind the software keyboard. Keyboard-aware single-action screens
therefore use the already-installed `react-native-keyboard-controller` viewport with automatic route offset.
The footer now follows the keyboard while the FlashList/ScrollView viewport shrinks and remains scrollable.
The user's follow-up screenshot further resolves the footer geometry: once the keyboard is visible, there is
no bottom Safe Area to consume. The shared action therefore drops the home-indicator inset immediately and
keeps only its normal button padding until the keyboard closes; it must not become a double-height bar above
the keyboard.
Async buttons and rows replace only the initiating label/icon with a loader, expose busy/disabled accessibility
state, prevent duplicate work, and preserve their primary or danger surface during progress. The verified
currency, keyboard, Pro-plan and Pro-review states are stored in
`docs/debugs/contact-sheets/12-bottom-actions.png`.

## P1 — confirmations adopt one cpk-ui composition (2026-08-30)

The user's cpk-ui dialog reference supersedes the remaining screen-specific confirmation cards. Logout, member
roles/removal, invitation revocation, app-lock disable, entry/comment/photo deletion, category archival, and ledger
deletion now use one compact cpk-ui `AlertDialog` adapter. It caps phone/tablet width, keeps the semantic icon and
two text actions readable in both themes, and refuses outside-tap dismissal.

Physical Android E2E exposed a separate interaction problem hidden by the correct-looking swipe UI: the cpk-ui
pressable inside `ReanimatedSwipeable` never received the final tap. Gesture Handler's native `RectButton` now owns
that surface and wraps one accessible content child. The final local Release APK opens administrator and member-
removal dialogs, and both were cancelled without changing the synthetic ledger. iPhone Maestro passed the final
logout assertion and cancellation; iPad was directly inspected after the final local build. Evidence is in
`docs/debugs/e2e-alert-dialogs-2026-08-30/`.

## P1 — protected LedgerItem routes and author/admin editing (2026-08-30)

The user's latest multi-account and detail-screen corrections supersede two incidental implementation rules.
First, `itemWritePolicy: ANY_MEMBER` permits every writable member to create an item; it does not transfer edit
ownership of one member's item to every other member. Client and Convex authorization now agree that only the
item author or an `ADMIN`/`OWNER` can update or delete it. This is a permission correction, not a schema change.

Second, a LedgerItem read screen no longer mixes Update and Delete into inline footer buttons or a generic More
menu. New navigation uses the canonical `/ledger/[ledgerId]/item/[itemId]` route. LedgerItemDetail shows one
localized top-right Update action only to the author/admin, and the shared Add/Update form owns the destructive
Delete action behind the cpk-ui confirmation. The compatibility `/entry/[itemId]` route remains only for already
installed notification/deep-link targets.

Route ids are now treated as hostile account-scoped input. Safe indexed point queries return `null` for a stale,
revoked or foreign ledger/item instead of throwing through the global error boundary. Canonical route guards keep
the prior active ledger unchanged, show no protected content or transient error, and immediately pop history or
replace to the timeline when no history exists. This explicitly supersedes the observed error-refresh-recovery
sequence after account switching. The active regression register is `.notes/qa/USER-CORRECTIONS.md`, and the
canonical E2E workflow must exercise both history/no-history deep links plus account A/B isolation before release.

## P1 — LedgerItem comment composer follows the keyboard (2026-08-30)

Physical Android Release QA supersedes the earlier assumption that a
route-level keyboard-avoiding height wrapper was sufficient for
LedgerItemDetail. The software keyboard opened successfully, but the entire
attachment/input/Send surface stayed at the closed-screen bottom and became
invisible. A focused input existing in the accessibility tree was therefore
not evidence of a usable layout.

LedgerItemDetail now keeps FlashList as the scroll owner and places the complete
composer in the keyboard controller's sticky viewport. The composer moves to
the keyboard edge as one unit, drops the bottom Safe Area while open and
restores it when closed. The focused structural test locks the sticky boundary;
physical evidence must additionally show visible typed text because native
keyboard motion cannot be approved by Jest alone. The before/after capture,
successful synthetic comment mutation, shared cpk-ui deletion confirmation and
cleanup are recorded in
`docs/debugs/user-corrections-2026-08-30/REPORT.md`.

## P0 — cpk assets and native splash have one outer owner (2026-08-30)

The iOS simulator Release remained on the native splash in both preserved and
fresh app state. Those paired checks rejected the initial stale-session and
keychain hypotheses. The full device log showed the actual boundary failure:
the `expo-font` config plugin registered cpk/Pretendard in `UIAppFonts`, then
`CpkProvider` attempted to load the same files and iOS reported duplicate font
registrations. Since cpk-ui does not render its children until `assetLoaded`,
Navigator never mounted and could not hide the native splash.

Removing the duplicate static registrations cleared those font errors but a
fresh unsigned simulator build still remained on the splash. That paired result
rejected font duplication as the complete root cause and exposed the provider
boundary problem: local-storage/auth recovery screens can replace `Navigator`,
but splash hiding lived only inside `Navigator`. A fallible outer provider could
therefore render a valid recovery screen that stayed permanently hidden.

`CpkProvider` is now the only runtime authority for its bundled fonts. Its first
child owns native splash release as soon as cpk assets are ready, before every
auth, storage, subscription or boot provider. Recovery UI is therefore visible
even when `Navigator` never mounts. Every iOS candidate must launch once with
preserved state and once with fresh state; seeing a native process id or waiting
longer is not launch evidence.

## P0 — cpk horizontal controls preserve both fixed actions (2026-08-30)

Physical iPhone Release replay superseded the Android-only assumption that the
comment correction was complete. The keyboard-sticky composition moved as
intended, but cpk-ui `EditText`'s 100%-wide root displaced the trailing Send
control. Applying flex directly to that root did not constrain its iOS width;
the field now fills a separate flex wrapper between fixed 44-point attachment
and Send controls.

A second replay showed the Send accessibility node in bounds but its treatment
remained invisible. `CustomPressable` accepts a static `StyleProp`; passing
React Native `Pressable`'s `({pressed}) => style` callback nested that function
as a style value, leaving the white foreground on an unpainted surface. Comment
Send and photo-viewer bottom actions now pass static styles and leave pressed
feedback to the cpk-ui primitive. iPhone and iPad screenshots must show the
actual circle/icon; an accessibility node or successful coordinate tap alone
does not satisfy this invariant.

## P0 — self, onboarding and public profiles own distinct paths (2026-08-30)

Fresh Android Account C onboarding superseded the first dedicated My Profile
route. That implementation placed signed-in My Profile at `/profile`, but the
same URL already belongs to `(onboarding)/profile.tsx`. The handle mutation
succeeded on the server while Expo Router resolved the wrong owner and left the
client on Handle; retrying then correctly returned `alreadySet`. A working
self-profile screenshot from that artifact therefore could not approve its
onboarding navigation.

The normative ownership is now: onboarding Profile = `/profile`, signed-in My
Profile = `/profile/me`, public member profile = `/u/[handle]`. Drawer Profile
opens `/profile/me`; a public lookup of the signed-in user redirects there
before public moderation actions render. The ready route tree must not contain
`profile/index.tsx`. Current local Android Release `4eb0c2…` passed a completely
fresh Handle → Profile → Ledger → calendar replay, while fresh iOS auth and
the full account-isolation cycle remain release gates. Exact failure and
replacement evidence is recorded in
`docs/debugs/user-corrections-2026-08-30/REPORT.md`.

## P0 — LedgerItem routes and presentation are canonical (2026-08-30)

The earlier `/entry/new` and `/entry/[itemId]/edit` ownership is superseded.
LedgerItem create, detail and edit now live under the target ledger:
`/ledger/[ledgerId]/item/new`, `/ledger/[ledgerId]/item/[itemId]`, and
`/ledger/[ledgerId]/item/[itemId]/edit`. Create and edit are pushed full-screen
pages with Back; Edit alone exposes confirmed Trash at the top right. Category
selection remains the only entry form sheet, with Add as its first grid item.
Route guards reject unavailable ledger ids before the form renders. Android and
iPad current-local replays verify the presentation; the active QA register owns
the still-pending store-artifact and remaining device matrix.

## P0 — pending invites resume after first-account onboarding (2026-09-01)

The invitation design already required SecureStore custody and a root-layout
continuation, but the implementation previously only wrote the pending code.
No runtime path read it again. A user who opened a link while signed out could
finish email or social authentication and profile setup, then land on the
ordinary ledger onboarding screen with no way back except tapping the original
link again.

The root route tree now owns one continuation effect. It waits until the
account is either ready or at the ledger onboarding step, reads the normalized
24-hour pending code, and replaces the current route with `/invite/[code]`.
The preview remains the consent boundary; redeeming the invitation can complete
the ledger onboarding step. Terminal preview/redeem outcomes clear only the
matching pending code, while wrong-account and capacity outcomes remain
recoverable. This reconciles `sharing-invites.md` §2.4 with the implemented
auth state machine and supersedes any test claim based only on an already-
onboarded Account B opening a link.

### Post-accept stack and hosted-link correction (2026-09-01)

The first fresh iPhone acceptance replay found two gaps hidden by the design
contract. First, the earlier G10 wording named AASA and `assetlinks.json` but no
generated public artifact existed, so the canonical HTTPS link remained in
Safari. `scripts/generate-public-site.ts` now owns the exact Apple app id,
Android package/signing fingerprints, both well-known files, JSON response
headers, and a localized `bookoo://invite/<code>` landing-page fallback. The
Google Play App Signing fingerprint remains an exact release-time input and
must be verified against the Play-installed artifact.

Second, redeeming an invite while completing ledger onboarding changed the
protected root stack and immediately replaced `/` from the outgoing stack.
iOS rendered a blank route even though the server membership was correct. A
24-hour SecureStore marker now binds the completed invite to the accepting
user. The ready root consumes that marker, clears both invite markers on a
best-effort basis, and only then replaces `/`; cleanup failure cannot strand an
already-joined account. A fresh account passed this transition without a cold
relaunch. This supersedes any earlier continuation claim based only on server
state or a post-relaunch drawer.

## P0 — BooKoo casing is human-facing, lowercase is technical (2026-09-01)

The Expo project previously displayed `bookoo`, which made a technical slug
look like the product name. Human-facing surfaces now use `BooKoo`; exact
lowercase identifiers remain unchanged where casing is part of routing,
signing, linking, package identity or persisted keys. Store positioning also
supersedes the proposed “open-source ledger” language: the current private,
unlicensed repository cannot support that claim, and Shipaton requires public
open-source code only for its student-only Next Gen path. Current copy instead
names the product's verifiable invitation, role, app-lock, export and deletion
controls without making absolute security promises.

## P0 — sampled performance monitoring is not product analytics (2026-09-01)

The earlier launch wording that rejected every automatic client telemetry
stream is superseded only for EAS Observe's bounded technical-performance
surface. Release builds use a deterministic 25% installation sample; local
development dispatch is disabled. Router integration, URLs and query
parameters, account/ledger/item identity, custom events, user attributes and
automatic JavaScript error payloads remain excluded. The root TTI marker may
run only after authentication and the profile mirror leave their loading
states.

This does not authorize product analytics, session replay, advertising
tracking, Sentry, or a custom event stream. Public privacy copy and store data
answers must disclose the anonymous installation identifier, performance and
other diagnostics, United States processing and minimum 90-day metric
retention before an Observe-enabled binary is submitted.

## P0 — Convex is the only durable ledger-data authority (2026-09-02)

The earlier D6 encrypted query mirror and durable offline outbox are
superseded. They increased launch and recovery failure modes while making a
locally accepted write look committed before Convex had confirmed it. BooKoo
now keeps only the current process's reactive Convex result in memory. Entry
create/update/delete and comment creation call the online mutation directly;
an unavailable connection retains the form or draft, explains the impact, and
offers an explicit retry.

The server's `clientRequestId` idempotency contract remains authoritative. An
unchanged ambiguous retry reuses its in-memory request id for the mounted form,
while a changed payload receives a new id. No request argument, ledger entry,
comment, member list, or query result is written to ordinary MMKV. SecureStore
continues to own auth tokens, the app-lock verifier, and bounded invite
continuation. A best-effort launch side effect clears the retired encrypted
store, key, account-scope marker, and provision marker without blocking render
or contacting/deleting server data; an unreadable orphan remains encrypted and
inert.

The matching recovery screen, pending counter, queue sheet, queue diagnostics,
and persisted-query fallbacks are deleted. State surfaces now follow the
contextual top-start rule in `visual-language-2026.md`; this supersedes generic
`flex: 1` centred spinner/label/action compositions and raw invite/error enum
copy.

### 2026-09-02 — FlashList sticky-header compatibility supersedes the SDK pin

The scaffold-era rule to keep `@shopify/flash-list` at Expo SDK 57's static
`2.0.2` recommendation is superseded for BooKoo's sectioned ledger timeline.
The published `2.0.2` package has no `stickyHeaderConfig.hideRelatedCell`
contract, so it paints the source day row as well as the pinned copy during
scrolling. FlashList `2.3.1` is JavaScript-only, declares unrestricted React and
React Native peers, and fixes the duplicate through its public API. BooKoo pins
that exact version and lists it under `expo.install.exclude`; this is a narrow
version-check exception, not a blanket Expo Doctor exemption. iOS and Android
must both pass the populated, repeated-scroll smoke whenever the pin changes.

## P0 — localized ledger vocabulary supersedes legacy list copy (2026-09-02)

The migrated `ledger` and `ledgerItem` strings previously retained literal
legacy “list,” “household item,” and machine-translated household wording.
Those strings are superseded by domain copy: a ledger is a ledger/household
book, a ledger item is an entry or record, and comments are comments rather
than reviews. This also corrects two meaning-changing translations: Chinese
Accept and Reject were reversed, and Japanese financial income was rendered
as `輸入` instead of `収入`. The five application locales now carry explicit
semantic regression assertions for these actions and terms.

## R13 — entry-detail conversation empty state (2026-09-03)

The earlier entry-detail implementation rendered only the localized zero-count
label above an otherwise blank comment viewport. The normative treatment is now
the compact, horizontal section state in `visual-language-2026.md`: loading is
contained in the comment region, writable ledgers explain the useful next
actions, and read-only ledgers explain what will appear there. This supersedes
the unexplained-whitespace result without turning a section state into a
full-screen card or hero.

## R14 — signed-out intro copy and legal links (2026-09-04)

The post-tutorial sign-in screen had accumulated a headline, supporting paragraph, shared-ledger
pill, wallet mark, inset glass card and a non-interactive legal sentence. Those are superseded by the
Legacy wordmark-centered canvas in `visual-language-2026.md`: the shared-ledger value line, a
full-bleed provider dock, official white Continue capsules for Apple/Google, and Martie-style
tappable Terms/Privacy links. The email OTP step no longer repeats legal copy or a bottom Back/help
row. Light/dark appearance applies only after sign-in.

## R15 — text-button press padding (2026-09-04)

Tutorial Next/Get started used a `CustomPressable` whose pressed underlay hugged the glyphs, and
cpk-ui `type="text"` buttons used 8px all-around padding with a transparent underlay. Those are
superseded by the text-button rule in `visual-language-2026.md`: 8pt vertical / 16pt horizontal
padding, a hugging hit target, and `theme.role.underlay` on press for every text button.

## R16 — tutorial Get started stays on the auth index screen (2026-09-04)

`router.replace('/sign-in')` from the last tutorial page is superseded. That native stack
replacement of the horizontal pager plus the sign-in dock is the Android Fabric
`addViewAt failed to insert view` crash. Get started now unmounts the tutorial, then mounts
sign-in on `app/(auth)/index` after one animation frame. `/sign-in` is unchanged for invite
and help entry.

## R17 — onboarding dialog has no fake tab chrome (2026-09-04)

Username and display-name onboarding briefly painted a dummy header and bottom-tab bar behind
the blocking `AlertDialog` so the dim overlay would look like the main app. The main tab
route is not mounted until session stage `ready`, so that chrome was fake. The dummy bars are
superseded: the dialog sits on an empty appearance-themed screen. Do not reconstruct tab or
header chrome for this step.

## R18 — identity dialog overlays the live app shell (2026-09-04)

R17's empty onboarding canvas is superseded. After sign-in the real `(app)` tab shell mounts
while `onboardingStep` is `handle` or `profile`, and the blocking `AlertDialog` is forced on
top of that live UI. Ledger queries skip until onboarding is `done` so the shell can render
its empty state without `ONBOARDING_REQUIRED`. Dedicated onboarding routes remain only for
legacy-claim and first-ledger. Close / Android Back still exits on Android and signs out on
iOS.

## R19 — no-ledger empty canvas is the Legacy Main (2026-09-04)

Tab empty states had used a generic Wallet `ScreenState` with a filled add button and a
heading that repeated `가계부 추가`. That is superseded by BooKooLegacy `Main` `noLedgerView`:
mint hamburger, `icNoLedger` mark, `NO_LEDGER_TXT`, and an outlined capsule add. The same
canvas is shared by Monthly, List, Stats, and More.

## R20 — first-ledger uses the live app shell (2026-09-04)

R18's dedicated first-ledger stack is superseded. After the handle dialog the real `(app)`
shell stays mounted through `onboardingStep === 'ledger'`. Hamburger opens the Expo Drawer;
profile goes to `/profile/me`; settings goes to `/settings`. Creating a ledger from
`/ledgers/new` finishes the ledger onboarding step. The fake `LegacyNoLedgerScreen` overlay
and `legacyLedgerForm` filename are removed — this is a new store listing, not a UI labeled
legacy. Ambiguous Firebase account-claim remains the only dedicated onboarding route.

## R21 — recovery canvas matches empty-ledger (2026-09-04)

Problem screens used a logo, error-code pill, and decorative ledger lines. That is superseded
by the empty-ledger canvas: mint header, white circular mark, placeholder copy, outlined capsule.
`linkedAccounts` is an identity read and uses `requireActiveProfile`, not `requireOnboarded`, so
Account works before the first ledger exists.

## R22 — ledger icon is independent of colour (2026-09-04)

Legacy create stored only `info.color` 0..5, so the rewrite mapped that to `colorKey` and a piggy PNG.
Create/edit now also stores `ledgers.iconKey`, a Phosphor name from `shared/ledgerIcons.ts`. Colour still
paints the chrome; the icon is chosen separately (random on colour change, shuffle, or the colour+icon
picker). Migrated rows omit `iconKey` and keep the piggy fallback. Do not bind the glyph 1:1 to colour.

## R23 — dark mint chrome is the deep TEAL companion (2026-09-04)

Dark `theme.role.primary` (`#34E0B7`) is a bright glyph colour. Filled empty-ledger / recovery /
new-ledger mint chrome must use `LEDGER_ACCENTS.TEAL.dark.base` (`#0E5E4A`) via `brandLedgerSurface`,
matching an existing TEAL ledger header. Using light `#1DD3A9` or dark `role.primary` on those
banners is a light-mode mint leak. The empty-ledger add action is a solid TEAL capsule with white
label text; an outline whose label uses the fill colour disappears on the navy canvas.

## R26 — development empty-ID leave and debounced availability (2026-09-04)

Empty handle save is a development-only escape hatch so QA can leave the ID modal and re-open
it. Production disables Update while the field is blank. A development skip leaves without
calling `changeHandle` and does not show a skip notice. Availability copy hides on each
keystroke and returns only after 800ms without further edits; `checkHandleAvailability` is
`skip` until that debounce settles. Querying on every character is a defect.

## R25 — appearance and currency radios (2026-09-04)

Theme, default currency, ledger currency, auto-lock timing, the all-ledgers switcher, Pro plan
cards, and `OptionSelect` lists use the same cpk-ui radio mark as language. `SettingsRow` no longer
turns a disclosure caret into a check. A selected single-choice row is never a filled check or a
caret.

## R24 — language radios, deferred apply, developed-country locales (2026-09-04)

Applying `setLocale` while Language settings is still mounted remounts the saving footer and pops
in the same turn; on Android Fabric that freezes. Persist the Convex locale first, leave, then
notify i18n listeners after navigation interactions. Language rows use cpk-ui `RadioButton`, not
checkboxes (this supersedes the earlier checkbox-not-caret correction). Shipped UI locales are
`en ko ja zh id de es fr it nl pt`.

## R27 — user-chosen ID and generated fallback name (2026-09-04)

The silent `claimGeneratedIdentity` client flow and the statement that login
never shows an identity dialog are superseded. A missing handle is a blocking
identity state even when a damaged or manually edited profile still says
`onboardingStep: done`; the app must show the live-shell ID dialog and require
an available user-chosen ID. Only a missing display name is generated. New
profiles and blank profile updates use the same deterministic fallback, and
repairing a previously completed account must not send it through first-ledger
onboarding again.

The tutorial's discrete active-dot swap is also superseded by one moving
progress pill. Its transition is Reanimated on the UI thread, uses the standard
250ms on-screen ease-in-out curve, and respects reduced motion.

## R28 — concise sticky settings and inverse action accents (2026-09-04)

The earlier compact settings hero, per-row descriptions, effective-date furniture, About
document-history row, and support migration guidance are superseded. Grouped settings use a
FlashList-backed SectionList with sticky section headers and concise labels. About contains
only the centred app icon and version in its list header. Korean account
removal is `탈퇴하기`; all other shipped UI locales use the corresponding leave-BooKoo verb while
legal process copy remains precise about data deletion. Support is `고객 문의` with the single
`이메일 문의` action.

Contextual actions invert the ledger palette across appearance: dark mode uses the original light
ledger swatch and light mode uses the deep dark companion. Ledger-identity chrome remains
same-appearance. All visible press feedback clips to a continuous rounded rectangle or circle.
Static selection rows update synchronously; optional preparation starts on route entry, and only
the explicit save action may perform the server write.

## R29 — one-line menus and single-purpose settings routes (2026-09-04)

R28's About rows and the earlier root Feedback/Logout entries are superseded. A read-only comparison
with Petgu and Martie confirms the reusable rule: ordinary menus are one-line noun labels with an
optional current value, not a label followed by a sentence. BooKoo's settings root now contains only
General, Account, and Information groups; Customer inquiry replaces the duplicate in-app feedback
form, Logout remains inside Account, and About contains only its logo/version SectionList header.

Ledger More no longer repeats global Language or exposes every administrative route at once. It keeps
common ledger and preference rows, then opens low-frequency export, deleted-entry, join-request, audit,
report and destructive controls through one `Manage` row. Permission, destructive, validation, empty,
recovery and diagnostic screens may retain the minimum explanation required to act safely.


## R30 — stable tab motion and one-fact-once surfaces (2026-09-05)

The discrete bottom-tab shape swap is superseded. Tab icons and labels stay in fixed slots while one
56×32 Reanimated indicator moves between them in 250 ms; reduced motion snaps to the destination.

The earlier empty-day date/body and R29's generic Account action placement are also superseded. A selected
calendar day with no entries shows only one centred Add entry text action: no repeated date, calendar icon,
or “no entries” sentence. Account places the outlined Logout button immediately below sign-in methods in
scroll content, while only the quiet leave-BooKoo action is fixed at the bottom centre without a section
label. This is the reusable one-fact-once rule: already visible route or selection context is not repeated.

## R31 — one ledger swatch across themes and a dedicated Android splash (2026-09-05)

R23's deep dark TEAL companion and R28's opposite-appearance action accent are superseded. Each of the six
ledger identity colours now uses the exact original light swatch in both light and dark mode, including
ledger-scoped actions. Contrast comes from the surrounding surface and the defined foreground, not a second
red, green, yellow, blue, orange, or purple palette.

Android splash ownership is separated from launcher icon ownership. The launcher keeps its adaptive
mask-safe foreground, while Android cold start uses a dedicated transparent `splash-icon.png` containing
the existing BooKoo wordmark padded inside the Android 12+ circular safe area on navy. iOS keeps the full
Legacy `splash.png`. Neither platform reuses the adaptive launcher icon as its splash mark.

## R32 — native Paywall compatibility over dashboard novelty (2026-09-05)

A dashboard Paywall is not release-ready merely because its JSON publishes or its web preview looks correct.
The current BooKoo native baseline is pinned exactly to `react-native-purchases` and
`react-native-purchases-ui` 10.4.2, which embeds RevenueCat iOS 5.80.2 and Android 10.12.0. RevenueCat
Paywall revision 8 is the compatible shipping design: no media component, Annual selected by default, one
mint purchase action, and explicit nested in-app-browser URL payloads for Terms and Privacy.

The attempted newer 10.9.0 / iOS 5.87.1 baseline is superseded until the RevenueCat dashboard can attach and
verify the required workflow to the current offering. A client-SDK upgrade must be treated as a native release,
not an OTA, and must render the current offering on signed iPhone, iPad, and Android store builds before the
version pin changes.

## R33 — inline picker Back ownership and native-install cold start (2026-09-05)

When an editor conditionally owns a full-screen picker, Android hardware Back belongs to that picker first.
It closes the picker and preserves the editor draft; only the next Back may leave the editor. This applies to
location and any future inline full-screen selector.

After installing a new native APK, E2E must stop and cold-launch the app before opening a deep link. Reusing a
process whose React context has not initialized is not a valid route or UI result. The Maestro release flow owns
this by starting with `stopApp: true`.

## R34 — compact entry controls and orientation-aware monthly layout (2026-09-05)

The earlier Income-first order is superseded by the final Expense → Income correction. Entry tab text and
amounts share one leading edge with a smaller inter-control gap; rounded touch padding extends around the text.
Statistics uses the same Expense-before-Income filter order.

September 7 clarification: the user's reference is for spacing, not a return to Income-first order. Only
move Income left in the entry editor. Replace the 112-point cells plus 12-point gap (124-point step) with
104-point cells and zero gap, moving Income and its indicator 20 points left. Preserve Expense's origin,
balanced 16-point horizontal padding, 44-point minimum targets, all form spacing and other screens.
A 96-point cell with 16-point padding was rejected during native inspection because English EXPENSE
wrapped; do not restore that squeezed text width.

September 9 follow-up supersedes the 104-point/16-point geometry above. Halve the visible gap, not the
entire tab width: use 88-point cells with balanced 8-point padding and zero outer gap. This moves Income
16 points left while preserving the 72-point text space, 44-point touch height, Expense/amount leading
edge, underline width and label sizes. Match the row offset, indicator origin and swipe step to the new
padding/width; changing width alone repeats the rejected wrap regression.

The width-only tablet monthly split is superseded. Side-by-side content requires a landscape window; portrait
and square windows stack the calendar above entries in one paginated FlashList. Month/day state remains above
the layout branch. Full-screen waits occupy the full available body, not a chart or half-width pane. Empty
month copy appears once, and its icon and text align at their vertical centres.

## R35 — screenshot-led UI review and compact sticky titles (2026-09-05)

The user should not have to identify every page defect. `$loop-ui` now owns a proactive page inventory,
actual device captures, control/transition inspection, verified fixes and replay, followed by the final
storyboard refresh. It is a visual/functional audit, not automatic release authority. Old images, redirects,
mocked service results and inaccessible devices must not inflate current passing coverage.

Two-line expanded parallax titles need sufficient height; the collapsed title remains one leading-aligned
line beside the hamburger. Multiword button labels must remain visible throughout the press. The physical
Pixel held-state capture reproduced a missing second word despite an unchanged accessibility label; this
remains open until a native after-capture proves the shared-control fix.

## R36 — verified commerce actions and unknown entitlement (2026-09-05)

R32's revision 8 designation means the current published baseline, not release
acceptance. Fresh native replay finds indistinguishable plan selection and a
failed Close action. A Paywall passes only when live prices, selected state,
Close, Restore, legal links and sandbox outcomes work on the shipping native
SDK. Two failed editor draft attempts remain unpublished; a successful save or
web render never grants native approval.

Resolve the signed-in server identity before native commerce and serialize SDK
identity changes around the whole operation. Active subscribers reach Customer
Center, not an opening spinner or another sale. Deferred payment and post-store
verification failures stay pending. Unknown entitlement suppresses ads; it is
not proof of the free tier or permission to grant premium access.

R35's held-button defect was resolved upstream in published cpk-ui beta.2 with
native/web after-captures. Separately, BooKoo's semantic outline adapter must map
all four border edges to the contextual foreground and preserve cpk-ui disabled
and danger semantics. Portrait/square Stats follows R34's stacked-layout rule;
only landscape may split panels.

## R37 — real brand logo and named RevenueCat configuration (2026-09-06)

The large repeated `BooKoo Pro` hero title and R32's blanket no-image direction
are superseded by the user's explicit logo request. Reuse the actual app logo
as a small native image, with one brief headline and truthful Pro benefits.
This is brand identification, not permission to add generated decorative art
or unsupported `media` components. Preserve live prices, visible native plan
selection, purchase, renewal/offer disclosure, Restore, Terms and Privacy.

The dashboard configuration is named `BooKoo Pro — Main Paywall`; its internal
name is distinct from the customer-facing hero. Keep the existing paywall and
offering identifiers. Design changes remain drafts until inspected and ready
for explicitly authorized publication.

The prior draft Restore-visibility failure was observed in the web renderer,
not a native draft. RevenueCat documents that web paywalls hide Restore and
Back actions; the dashboard editor does show Restore. Reclassify that specific
observation as an unverified native gate, not proof of a missing native action.
The published native selection and Close failures remain open until replayed.

Draft 28 now uses the dashboard's supported `selected` overrides on both package
stacks; base styles remain neutral. Unreliable static checkmarks were removed.
Both themes reference matching generated PNG/HEIC/WebP logo variants. Serialized
configuration and a web rendering are still not native interaction acceptance.

## R38 — progressive disclosure without duplicated menus (2026-09-06)

Fresh device captures showed that Manage repeated the common ledger and General
sections before its secondary actions. This contradicts the user's durable
anti-redundancy rule. More owns common destinations; Manage owns only export,
deleted entries, join requests, audit, report and destructive controls, with
unchanged permissions. Use `Manage` once in the header, not the ledger title
and a second identical section label. Continue using the existing shared row
and FlashList section composition; this is domain navigation, not a new primitive.

## R39 — one resumable UI/E2E audit (2026-09-06)

The user's concern about repeated setup is supported by duplicate skill recipes,
repeated basic journeys, unbounded/fixed waits and unclassified device startup
failures. R35's proactive full coverage remains required, but it does not mean
restarting that entire audit after every fix. One shared execution protocol owns
preflight, focused replay, evidence invalidation and final acceptance. Auth and
native-build prerequisites stop downstream route retries; store blockers do not
send an otherwise usable device back through already passed basics. Fresh
candidate acceptance and honest pending gates are not weakened for speed.

## R40 — information hierarchy and native theme evidence (2026-09-06)

The user's concise-UI rule supersedes repeating a native FAQ/Announcements
title as the sole section heading. Retain genuinely distinct sticky sections;
allow two-line content titles using the existing shared Typography surface.

Native-theme acceptance covers separate store/RevenueCat activities, not only
React settings. Apply saved appearance at app scope and release System without
changing the device-wide setting. A checked System radio proves the preference
was restored; its immediate frame does not prove the settled OS theme.

## R41 — money input, signs and upload retry identity (2026-09-06)

Expense-first and numeric-only remain the product rules. They do not mean
discarding the stored refund/clawback sign: list, detail and editing project
cash flow exactly once without changing storage. Group separators must not
become decimal separators merely because they occur first in a paste. For
zero-exponent currencies, fractional digits cannot become whole-unit digits.

A successful entry create followed by a failed photo upload is a partially
completed save, not a new draft identity. Retry updates that entry even if the
user edits the remaining draft. New uploads are capped at five, while existing
historical attachments remain readable. Empty prompts and entered values use
different foreground contrast; changing appearance must not erase that distinction.

The obsolete signed-out-intro instruction to auto-assign a public ID was
removed from the visual guide; R27's mandatory user-chosen ID remains authoritative.

## R42 — all tablet panels and short-content collapse (2026-09-06)

The portrait stacking rule is not Calendar/Stats-only: Timeline must also stack
list and selected detail when height >= width. Empty/loading states use the
available content region without a redundant empty detail panel. Landscape may
retain master/detail. Two-line parallax titles require enough scroll extent to
reach the single-line sticky state even when entries are empty. Verify painted
button labels on native Android, not just accessibility strings or unit tests.

## R43 — white on ledger fills in dark mode (2026-09-06)

The latest user correction explicitly supersedes navy on dark ledger fills.
All six original identity swatches retain white text/icons in both appearances:
filled actions, header chrome, calendar selections, segments and colour checks.
Outlined/text actions on the normal canvas retain accent text colours; disabled
and semantic danger/warning states keep their tokens. This is an explicit visual
choice, not WCAG AA certification for white on the unchanged bright swatches.
Keep the decision in the shared accent tokens, not one-off screen overrides.

## R44 — optimized QA ads and untitled section rhythm (2026-09-06)

`__DEV__` describes optimization, not the backend/build environment. Explicit
development/preview builds use test ad IDs even with embedded release-mode JS;
production still requires its own IDs. This does not bypass consent or Pro
suppression. No test ad revenue is sent to RevenueCat.

The More tab's untitled Manage card needs a 24-point break above it. A missing
section title must not remove all separation between distinct cards. First
sections on standalone pages keep their compact top inset.

## R45 — Android sheet inset ownership (2026-09-06)

Fresh Pixel captures showed a second status-bar-sized gap above the Category
sheet header, including its settled state. Native formSheet owns that inset;
the embedded category picker/create composition opts out of AppScreen's top
inset on Android only. Full-screen routes and iOS retain their existing safe
areas. This applies the user's no-duplicate-header-space rule, not a new visual
primitive or a reason to remove safe areas globally.

The Android category creator must expose Save as soon as it opens. Its native
formSheet uses one tall detent: the Android multi-detent layout places a fixed
footer at the largest height, hiding Save at the smaller initial detent. The
picker may retain both detents because it has no fixed footer. Both entry route
families share these options; iOS keeps its existing detents.

Keyboard replay additionally exposed conflicting JS height avoidance and native
sheet translation. Android uses the navigator's native sheet-footer slot for
the existing BookooBottomAction, not a second keyboard-height calculation.
The form reserves the measured footer height in its scroll content. Both the
typed input and Save must remain visible with the keyboard open; testing only
Save produced a false pass while the form had collapsed.

## R46 — Android adaptive banner width (2026-09-06)

A live tablet rotation retained a 1280dp ad creative inside an 800dp footer,
clipping both disclosure and the action. The Android tab footer must pass its
actual measured slot width to the SDK and replace the native banner slot only
when that width changes. Collapse the old height until the new ad loads and
cancel the old retry timer. Height-only changes must not request another ad.
Keep iOS behavior unchanged for this Android-only correction. This refines the
mounted-for-retry rule: mounting is stable per ledger and slot width, not
across an incompatible adaptive size.
September 7 Opus review caught that a phone-constrained root can be narrower
than its window. The slot now measures itself and waits for positive layout
before mounting the SDK creative. A 700dp window / 500dp slot regression, width
rotation, height-only layout and unchanged iOS identity are covered.

## R47 — detail metadata width and quiet timeline dates (2026-09-06)

Tablet detail labels previously painted the date but clipped its trailing time
although accessibility exposed the full string. Give the category/date text
the remaining row width beside its icon; allow wrapping. Native pixels, not
only the accessibility label, must confirm the complete timestamp.

The user's September 6 timeline reference supersedes the dense bold date row
and its bottom divider. Dates use regular cpk-ui body text, semantic placeholder
color and generous 24pt top / 16pt bottom spacing. Keep the existing 16pt entry
edge alignment, opaque sticky background, daily net and bounded pagination.
Do not copy the reference's literal low-contrast blue into both themes. This
is ledger-specific Typography/layout composition, not a new section primitive.

## R48 — tutorial progress follows the swipe (2026-09-06)

The user again reported the tutorial indicator changing only after navigation.
Pixel recording on 68df1ad4 reproduces it: the page is halfway translated but
the pill remains at the first marker. The earlier 250ms timing/source-contract
PASS did not prove gesture synchronization and is superseded.

Petgu's reference at `/Users/hyo/Github/hyodotdev/Petgu` continuously updates
pager progress. BooKoo now feeds fractional native scroll position to cpk-ui's
generic PageIndicator. One UI-thread transform follows that value directly;
there is no second animation after settling. React state changes only when a
page settles, so rapid Next taps cannot skip to completion. Reduced-motion Next
commits without a momentum callback; rotation retains the selected page.
Generic geometry, theming, accessibility and reduced-motion behavior belong to
cpk-ui; BooKoo owns the three-slide composition and navigation.

## R49 — navigate by default, push only independent instances (2026-09-06)

The user's navigation correction supersedes the inherited push-for-every-link
habit. All current ordinary forward destinations reuse `router.navigate` with
their existing typed params. There is no identified need for duplicate instances
of the same destination. Return/replace/dismiss behavior is not mechanically
changed. Future push or Link-push exceptions require a product reason beside
the call and a test proving the intended stack/Back behavior. Do not treat
timers or tap debouncing as a substitute for route identity.
App/ledger stack declarations also use stable singular route identity, including
dynamic path IDs. The same entity is reused; different entities remain distinct.
Query-only identity and retained form state require explicit verification.

September 7 verification reproduced stale photo selection and statistics month
when `navigate` reused a matching path with changed query params. Their thin
route adapters now reset read-only domain content for that context, without
adding another route. Real-router regressions cover changed/removed query
params and one Back. Editable drafts retain their state and are not keyed by
every query change.
The Opus review's notification coverage gap reproduced a second tabs route:
`navigate('/')` entered a shim whose `replace` did not deduplicate the shell.
The archived-ledger notification now navigates to the canonical tabs route
directly. A real-router test covers the actual notification handler, unique
shell identity and Back order; no claim is made that replace itself deduplicates.

## R50 — landscape tablet empty-entry invitation (2026-09-08)

September 9 Android follow-up: the tablet breakpoint is the current window's
shortest dimension >=600dp. The former additional cpk media/device flag excluded
600dp portrait tablets and incorrectly constrained them to a 500pt phone root.
This replaces that classifier only; portrait/square stack, landscape split and
context preservation remain unchanged.

The user explicitly asks for a more intentional centered Add entry invitation
when a landscape tablet has no entries. This narrows R30's action-only rule:
mobile/portrait/square keep compact states, while landscape may pair one
ledger-tinted note/pencil mark with “Every entry counts.” and one filled
`+ Add entry` action. No repeated selected date, empty-state paragraph, fake
rows or decorative totals. Monthly centers within the right pane's measured
height; empty Timeline uses the whole content area, without a detail panel.
cpk-ui owns Card/Icon/Typography/Button; BooKoo owns only this domain
composition and existing ledger/day navigation. R42's orientation and
pagination behavior remain authoritative.

## R58 — category identity and keyboard-safe forms (2026-09-09)

The user's attached Color and Icon reference supersedes the name-only inline
category creator/editor. Both management and Entry creation must offer a name,
color and searchable icon groups. Management routes use a dedicated keyboard-
resizing form instead of editing inside the draggable list. This narrows the
earlier inline Save/Archive rule to Edit/Archive in the list and Save in the
form. Expense/Income separation is retained by the user's final clarification.
Legacy SQLite is reference behavior, not authorization to replace Convex's
shared category identity; bundled icon/color catalogs need no server reads.
Names are compacted only when changed, never merely because an icon/color was
edited. Preset names stay locale-derived unless explicitly overridden.

## R59 — continuous category actions and inline policy copy (2026-09-09)

Category ellipsis actions must transition both open and closed instead of
appearing abruptly. Keep a single controlled expanded row, independent edit
and drag targets, no duplicate interactive measurement tree, and respect
reduced motion. The cpk-ui Accordion owns disclosure motion and render slots.
Legal agreement copy is one text paragraph with nested tappable links. Never
use sibling flex-wrapped text blocks or insert a break after “agree to the”.
The user's Martie comparison specifies natural text flow, not copying its
older flex-row implementation. Full localized copy and both links remain.

## R60 — example email placeholder (2026-09-09)

The login email field displays `hello@gmail.com` only as its empty-state
placeholder, in the shared input's placeholder color. Keep the Email label,
email keyboard and empty initial value; never prefill or submit the example.
All locales use the same example address; real input replaces it naturally.


## R71 — motion impact and complete verification (2026-10-01)

The owner's request for impact refines R70's selection feedback: increase clarity
where a user deliberately changes identity, without relaxing its restraint or
changing the approved main/create layout. Native release feel determines the
tuning; mount/query/repeated-choice motion remains prohibited. Focused acceptance
does not supersede remaining whole-app/device gates.


## R72 — calendar circle and lively interactions (2026-10-01)

The owner's calendar request expands R70/R71 from identity feedback to deliberate
calendar-day selection and other state-changing controls. The earlier restraint
still applies to background refreshes, repeated taps and whole-layout movement;
it does not prohibit a perceptible selected-day circle. cpk-ui owns the calendar
visual/motion, and native OS reduced motion remains required.


## R76 — calendar feedback at page boundaries (2026-10-01)

Actual Play-app inspection of the first OTA exposed a hidden neighbour page
consuming October 2/3's feedback. R76 refines R72/R73: the approved circle
size and motion stay intact, while only the visible pager slot consumes the
intent. Both visible grids in two-month mode retain eligibility. Whole-app
acceptance remains separate from this scoped regression.

## R79 — English default for store localization (2026-10-09)

The owner's English-first correction supersedes the historical Korean-default
Play configuration recorded on September 20. `en-US` is the default and fallback
language. Korean remains a localized listing for Korean users, and the other
existing translations stay intact. This refines store presentation only;
community positioning, approved localized copy and in-app language selection
remain governed by their existing rules.

## R80 — bring back the legacy store cover (2026-10-09)

The owner explicitly prefers the supplied old gallery, especially its mint
cover with the white pig mark and two angled phones. This supersedes the
R63/R65 requirement that every panel have an aligned upright device and a
benefit headline: the first panel is a brand cover with no headline, followed
by restrained navy feature panels. Authentic native UI, proportional scaling,
synthetic fixture data and the eight-panel gallery remain required. The cover
originally led with calendar, followed by sharing, comments, timeline, stats,
entry, categories and theme; this ordering is superseded by R81 below.
This is a local candidate until submitted; published
metadata and the shipped September gallery must still describe the live assets.

## R81 — separate intro, then the owner's capture order (2026-10-09)

The owner supplied calendar/timeline/statistics, entry, sharing/comments and
theme captures, then clarified that intro appears before that sequence. This
supersedes R80's initial scene order and its reuse of the cover as the calendar
feature slide. Final order: intro, calendar, timeline, stats, entry, sharing,
comments, theme. A separate calendar panel follows the mint cover. The dedicated
categories panel is omitted so the gallery remains eight panels. R80's styling,
native-source requirements and R79's English priority continue to apply.

## R82 — move scan to the tab row's far right (2026-10-09)

After seeing the actual native receipt flow, the owner requested Scan receipt
to the right of Income, then clarified the far right of that same tab row.
This supersedes the initial 1.1.0 placement of the scan button under Photos.
Expense/Income geometry, the ordinary photo plus action, explicit OCR review
and pending-until-Done attachment behavior remain unchanged. The five entry
gallery sources must be recaptured after this correction before publication.

## R83 — iOS OCR uses device language preferences (2026-10-09)

The owner asks iOS to receive the user's device language rather than every
language. Initial implementation already selected app-locale languages and
English, but alphabetically sorted the result and enabled language detection.
R83 changes the native recognition preference to the first supported device
language plus English, preserving order and Chinese script. Supported-language
enumeration is capability metadata, not a request to load all models. Android
keeps its existing app-locale script selection; iOS continues using Vision.

## R84 — correct Apple inheritance and cover new placements (2026-10-09)

R80/R81 was implemented on Play but Apple1.1.0 inherited old assets. The
owner removed the review and requires refreshed iPhone/iPad/locale assets,
Duo transition testing, and the new header/search placements. Inherited216
Apple images are historical submission evidence, superseded by the required
new gallery. Source/build inspections and ordinary-photo/OCR rules remain.
Store resubmission waits for remote asset verification and any required new
native candidate inspection; preparation alone is not accepted as upload or
Duo verification.

## R85 — reduce scan button whitespace (2026-10-09)

The owner requests less whitespace around Scan receipt, especially on the
left and right. The original R82 action stretched to fill available width
and imposed a 44-point visible height. R85 replaces those sizing choices with
content width and a 34-point minimum visible height, 6/4-point horizontal/
vertical padding, and 5-point vertical hit slop. R82's right-edge placement
and 44-point effective touch target continue. Entry gallery captures made
before this correction must be refreshed before publishing.

## R86 — adapt auth to real foldable windows (2026-10-09)

The owner adds foldable UI to the1.1.0 scope and asks for imagegen artwork on
the right of unfolded login. The old full-width dock remains the compact
window composition; wide windows center the same auth controls on the left
and reveal one shared decorative illustration on the right. Existing compact
auth sizes and consent/provider behavior remain. No parallel login form or
fold-state store is introduced: current window dimensions own presentation,
and the existing mounted form owns typed input.

The owner's landscape screenshot exposes a test-environment mistake: a portrait
size override was still active in the landscape Android tablet. Restore it and
verify the actual landscape window. The keyboard controller's Android behavior
must not be left undefined for the newly centered email/OTP form; use its shared
padding behavior and verify the completion action with the native keyboard.

R86 landscape follow-up: remove the test-only portrait resolution override
before previews. Native keyboard-only viewport padding is insufficient on the
short landscape form; the existing focused-input scroll component also reserves
space for the following action and resynchronizes on layout changes.

## R87/R88 — asset compression and matching store names (2026-10-10)

The generated auth PNG is superseded by the shared transparent WebP, verified
on both platforms. Store PNGs retain decoded pixels and receive lossless
compression before fingerprinting. The earlier Google English tracker name,
Korean extended name and Indonesian Kas name are superseded by the corresponding
current Apple titles. Localized descriptions and English-first routing remain.

October13: the owner explicitly supersedes the Korean title
`BooKoo - 함께 쓰는 가계부` with `BooKoo 부쿠 - 공유 가계부` on both stores.
The initial Korean/four-language restoration is followed by the separate
October13 owner instruction to change all necessary store copy. That instruction
supersedes the earlier fixed English/EU names: canonical metadata now owns the
English expense-tracker name and localized shared-expense names, including
nl/pt/Traditional Chinese and regional aliases. English remains default and
the Korean title stays exact. Existing360 Apple/40 Play images/order remain. Saved
or submitted metadata must not be reported as public before store readback.


## R89/R90 — localized money and keyboard layout (2026-10-10)

Native localized-gallery inspection exposed a clipped long currency total in
stats. Preserve the full formatted money string and accessibility value; fit
one line within70% of the donut width through cpk-ui Typography's public props.
No shortened amount, alternate total or new chart primitive.

The R86 keyboard experiment's128pt clearance is superseded by24pt caret
clearance plus the keyboard controller's layout mode on iOS. The centered form
must reflow when the keyboard appears; a second iOS padding owner can blank the
form during scrolling. Retain verified Android parent padding/insets behavior.
Use one mounted form and its public focused-input/layout synchronization. A
short window or large text may scroll or dismiss the keyboard to complete the
form. Record native scope and restore QA text/window overrides; never claim
whole-app maximum-text acceptance from the standard-font replay.

## R91 — centered entry tabs supersede leading label alignment (2026-10-10)

The owner's Korean/Japanese screenshot correction supersedes R34's leading
label alignment and negative8-point tab/indicator compensation. Keep the
88-point cells and64-point underline, centering each label and indicator
within its cell. R82/R85's compact far-right scan action remains active.
The attached12000/September12 image matches the historical
2026-10-09-cover candidate. The selected1.1.0 native gallery already contains
receipt scan; regenerate from inspected current captures after the fix.

## R92 — wide creative logo spacing (2026-10-10)

The owner rejects the landscape mark next to the hero phone. Move that mark
into the upper-left green space in the canonical Blender generator. Preserve
the original white mark, size and actual native screen textures. This supersedes
the previous landscape logo position only; portrait intro placement stays active.


## Native purchase authentication timeout (2026-10-14)

The owner's pending-confirmation report is reproduced on TestFlight46. A scoped
StoreKit log records Payment Sheet Failed / dismissed without a result, while
the initial120-second UI watchdog has already resolved pending and discards
that late native failure. Start the existing watchdog only after the native
request promise returns. This supersedes treating elapsed authentication time
as confirmation-pending; verified-proof, account isolation and server entitlement
authority remain unchanged. No Apple receipt acceptance is inferred from a
Touch ID handoff or a closed payment sheet.


## October15 — actionable purchase confirmation

The owner's completed Apple purchase exposes an unenrolled test account. The
previous generic pending-only feedback is superseded for definitive, verified
account restrictions. The exact account is enrolled only after the owner's
explicit approval; no receipt, binding or paid-environment guard is relaxed.
The October15 purchase-feedback rule in visual-language-2026.md owns the UI.


## October22 — benefit-led store update copy

For1.3.0, the owner supersedes the draft ad-display wording with stability and
usability copy in both stores and every localized release note. This changes
public release-note framing only; factual privacy, review and SDK disclosures
are retained. The Store update messages rule in visual-language-2026.md owns
future copy. No runtime or release gate is waived.


## October24 — public website presentation

The owner supersedes the October23 text-only mint-header landing presentation
with a full BooKoo-specific redesign. The prior multilingual URL, metadata,
structured-answer, legal and native-association decisions remain authoritative.
SECOND ROUND is a craft/reference benchmark, not a source of copied game art,
red/black styling or game typography. Use original BooKoo assets and real app UI.


## October27 — internet-aware banner recovery

The previous capped retry loop remains the failure recovery owner, with native
internet reachability as a prerequisite. Offline periods cancel pending retries
and pause refresh instead of generating predictable failures. Convex connection
health is not a substitute for internet status. Display and Pro rules remain.
