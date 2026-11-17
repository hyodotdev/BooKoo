---
name: grow
description: Run one privacy-preserving BooKoo growth round from verified aggregate evidence, select exactly one experiment, and record its hypothesis and verification date. Use when the user runs `/grow` or `$grow`, asks what will improve BooKoo growth, activation, retention, invitations, store conversion, or Shipaton traction.
---

# BooKoo Growth Round

One round chooses one measurable lever. `docs/growth/ledger.md` is the only
cross-session growth memory: read it first and update it last.

## One round

1. Read the ledger, `docs/product/GROWTH_OPPORTUNITIES.md`, and the active
   release plan. Judge any hypothesis past its verify-by date before choosing
   new work.
2. Run `$analyze` on available aggregate evidence. Do not ask for data until
   repository, configured connector/API, and supplied evidence sources have
   been checked safely.
3. If no verified baseline exists, record round zero and stop. Do not ship an
   experiment in the baseline round.
4. Rank candidates by expected activation/retention/store impact, effort,
   privacy cost, release cost, and risk. Prefer a reversible change with a
   direct metric.
5. Select exactly one hypothesis with primary metric, guardrail, baseline,
   target, ship date, and verify-by date.
6. Implement only when the user authorized code changes. Use the normal
   `$review-self`, `$e2e-test`, `$perf-audit`, `$commit`, and release workflows
   as applicable. Store, IAPKit, deployment, production-data, billing, and
   public-post actions still need their own authority.
7. Update the ledger with sources checked, what shipped or was blocked, and the
   next verification date.

## Shipaton

During Shipaton, prefer work that proves BooKoo's shared-ledger value, closes a
submission gate, improves a documented conversion, or supplies factual design
and build-in-public evidence. Read `docs/release/SHIPATON_2026.md`; do not add a
paywall, analytics SDK, review prompt, or public claim solely to chase a prize.

## Never

- fabricate downloads, retention, conversion, revenue, reviews, or causality;
- buy, trade, gate, or incentivize ratings and reviews;
- use dark patterns, fake urgency, punitive streaks, or locked access to a
  ledger's existing data;
- copy private rows or personal data into the growth ledger;
- stack unrelated product ideas into one round.
