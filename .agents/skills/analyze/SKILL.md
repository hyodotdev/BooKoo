---
name: analyze
description: Analyze BooKoo aggregate product, store, IAPKit, and approved operational metrics without exposing private ledger data or silently adding automatic analytics. Use when the user runs `/analyze` or `$analyze`, asks to analyze BooKoo funnels, retention, invitations, store metrics, monetization, or growth evidence.
---

# BooKoo Analytics

Turn trustworthy aggregate evidence into one product decision. BooKoo's public
privacy contract does not authorize adding a tracking SDK merely for analysis.
The owner's November4 country decision is a separate, optional, consent-based
country-code-only addition; do not enable it through this analysis skill.

## Sources

Use available sources in this order:

1. user-supplied App Store Connect, Play Console, IAPKit, or support
   screenshots/exports;
2. purpose-built connectors or official APIs when the user has authorized
   access;
3. aggregate-only Convex queries that are already necessary and authorized for
   service operation;
4. `docs/growth/ledger.md` for verified historical snapshots.

Never deploy instrumentation, query production, change a store, or create a
paid resource merely because this skill was invoked. Never print or store user
ids, emails, ledger titles, memos, locations, photos, invite tokens, or raw
production rows.

## Analysis order

### Internal testing exclusion

For active-account reporting, first run `bun growth:report` (offline dry run),
then `bun growth:report --run --prod --out <DevLogs/report.json>` only under
the owner's production aggregate-read authority. The private
`<git-common-dir>/bookoo-growth/internal-accounts.json` is the sole owner-approved internal
account policy shared by all worktrees; never copy its selectors into tracked notes or output. If it
is absent, unreviewed or empty, report customer-only activity as unavailable.
Do not substitute an IAP sandbox list, subtract a guessed number of testers,
or call store DAU customer-only. The report returns rolling24h/7d/28d
authenticated active accounts based on existing latest presence, not historical
calendar-day DAU, installs or all anonymous users. Register newly approved test
aliases in that private policy before comparing snapshots. Keep store totals
separate and explicitly unfiltered.

For invitation/shared use, add `--sharing`. Report current shared membership,
invitation-backed membership and two members of the same ledger active in the
app as distinct metrics with cohort denominators. These do not prove joint
ledger viewing, contributions or invite-to-acquisition causality.
`ledgerMemberState.lastOpenedAt` is seeded on create/join and currently has no
app caller to `memberState.markRead`; treat same-ledger activity as unavailable.
Never reinterpret that seeded timestamp as collaboration.

Country breakdowns use only `ipCountryCodeAtLastSeen` with current explicit
country-analytics consent. Always show the full active denominator, known and
unknown counts and coverage. Device region, UI language, currency or timezone
are never country substitutes. Old/declined/failing readings stay unknown; no
historical backfill or nationality/residence claim. QA and internal exclusions
apply before grouping. This is the latest connection's approximate country,
not calendar-day country history or a unique human count.

Read `docs/product/GROWTH_OPPORTUNITIES.md` and evaluate:

1. ledger activation;
2. shared activation and invite acceptance;
3. first-entry completion;
4. active-ledger retention;
5. receipt and comment collaboration;
6. store conversion and, once approved, IAPKit trial conversion.

Separate unavailable, partial, and verified data. Do not estimate a missing
metric and do not call a logged-in-only or one-platform value whole-app truth.

## Response

Answer in Korean unless asked otherwise. Lead with the period, source, largest
verified leak or positive signal, and one recommendation. Then include:

- a compact metric/funnel table;
- data-quality and privacy caveats;
- up to three ranked experiments with primary metric and guardrail;
- exact app, disclosure, or event-contract changes only when implementation was
  requested.

If there is no trustworthy baseline, say so and list the minimum aggregate
export needed. Establishing a baseline is a valid result.
