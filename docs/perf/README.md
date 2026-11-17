# Performance evidence

Only aggregate results from synthetic isolated-deployment runs belong here. Raw
logs, deployment URLs, credentials, user identifiers, and production data stay
under `.local/release-evidence/perf/` and are never committed.

The first public release requires `loadtest-YYYY-MM-DD.md` containing:

- git commit, app/backend versions, UTC start/end, and isolated environment;
- deterministic seed parameters: 100,000 items, 10 years, 8 writers, 120
  categories, 5,000 photos, and the active `ROLLUP_SHARD_COUNT`;
- write count, success/error counts, p50/p95/p99 latency, redacted error
  classes, and the exact pass threshold from `SCHEMA.md` §5.4;
- Tier-2 per-query document-scan budgets copied from `SCHEMA.md` §4;
- a clear pass/fail decision and approver, without secrets or user data.

Run `bun scripts/perf/load-ledger.ts` without flags to print a no-network plan.
The driver requires an existing isolated non-production deployment, `--run`, and
`CONVEX_LOAD_CONFIRM_ISOLATED=1` plus `CONVEX_LOAD_CONFIRM_SYNTHETIC=1` before it
writes anything. It does not create, deploy, or delete cloud resources and it
rejects the production alias.

The release decision combines the measured aggregate with a human review of
the exact Convex Health/Functions window. Convex does not expose an approved
per-mutation retry counter to this tool, so BooKoo records whether a sustained
`items.create` conflict insight appeared; it never invents an OCC percentage.

`scripts/verify-readiness.ts` makes the dated report and load driver mandatory
before P1 can be marked DONE.
