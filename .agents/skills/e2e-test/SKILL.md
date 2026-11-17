---
name: e2e-test
description: Run BooKoo functional E2E on connected iOS/Android devices and available simulators. Use for /e2e-test, $e2e-test, device regression, or release verification of ledger, account, media and purchase flows.
---

# E2E Test

Run the device checks that protect BooKoo's core ledger UX. Prefer connected
devices named by the user; simulators do not substitute for their release gates.
Read the [shared execution protocol](../loop-ui/references/execution.md) first.
When loop-ui is active, join its report, navigation and capture session; do not
start a second complete audit. Select resume, focused or final mode and record
the next runnable batch while retaining the full requested matrix.
`references/workflow.md` holds the canonical setup, the per-scenario steps, and
the recovery notes. Run the scenarios the diff implicates, on both platforms
when the change is native or layout-related, and on one platform when it is a
pure JS change confined to a single platform's surface.

## Workflow

1. Confirm the task touches user-facing screens, native wiring, or the data the
   screens read.
2. Preflight the requested physical devices/current binaries first, then reuse
   available simulators and Metro. A missing native module requires a local
   rebuild, not more route retries.
3. Start only the missing local services the test needs.
4. Preserve app data. Fresh-install checks require a specifically approved
   disposable target; they do not authorize clearing a connected user's app.
5. Inspect each gate's capture (reuse it for overlapping assertions) and the
   batch's bounded app log window before marking PASS.
6. Report PASS/FAIL in a table with evidence.
7. Do not auto-fix failures unless the user explicitly asks. If a fix is
   requested, capture the failure evidence first, then patch and re-run only the
   failed scenario.

## Environment

- Repo: the repository root (this checkout)
- Normal QA: `dev.hyo.bookoo.qa`, selected by `BOOKOO_APP_VARIANT=qa`;
  `bun ios` / `bun android` / `bun start` select it by default. Read
  `shared/application.json` instead of inventing another package.
- Use the actual installed launchable activity; a QA app id does not imply a
  Java/Kotlin activity namespace. QA scheme: `bookoo-qa://`. It must not
  intercept production `bookoo://` or public invite links.
- Store identity `dev.hyo.bookoo` is only for explicit store/purchase acceptance.
  Document that exception and use an owner-approved excluded account. Do not
  replace an installed store app with a debug APK or run broad UI QA through it.
- Existing binaries do not become QA binaries through Metro/OTA. Verify the
  installed native id before exercising a target; build separately when needed.
- Metro: `bun start` on port 8081
- Native builds: `bun ios`, `bun android`
- Convex dev backend: `bun dev:convex` (leave it running; the app is useless without
  a reachable deployment)

Use absolute tool paths in shell commands where the environment allows:

```bash
export ADB=/Users/hyo/Library/Android/sdk/platform-tools/adb
export EMULATOR=/Users/hyo/Library/Android/sdk/emulator/emulator
export BUN=/Users/hyo/.bun/bin/bun
```

## Setup

Use the single setup section in `references/workflow.md` for missing services
only. Reuse the requested devices and current Metro. Leave devices running;
stop only a service this run started when no remaining batch needs it.

## Required Scenarios

Read `references/workflow.md`: it is the app scenario catalog, including
auth/session isolation, entries/media, pagination, calendar/stats, invitations,
comments, lock and theme/tablet. For purchase/Pro or release scope, also use
[the purchase matrix](../../../docs/release/PURCHASE_E2E.md) for native store purchase,
subscription management, sandbox, webhook and server entitlement gates. Do not duplicate
its collaboration steps when the shared audit already has matching evidence.
Keep every required scenario in that matrix; run only pending/invalidated gates.

Verify route names against `app/` before deep-linking; do not assume a path that
the router does not export.

## Performance Evidence

Scenario 4 is the one that legacy BooKoo failed. Record, from the device log or
the in-app timing you added for the run:

- rows rendered on first paint and after two `loadMore` rounds;
- absence of a full-list re-render when a single entry is edited;
- absence of a visible stall (> 500 ms) when scrolling a ledger with a large
  seeded dataset.

Any of these failing is a FAIL even when the screen eventually renders. Follow
up with `$perf-audit` to locate the query behind it.

## Reference

Read `references/workflow.md` for the exact setup commands, per-scenario steps,
expected UI, log filters, and recovery steps.

## Reporting

Use the active audit's table, with explicit pending prerequisites:

```markdown
| Scenario | Platform | Result | Evidence |
|---|---|---|---|
| Named gate / state | Exact device/theme | PASS/FAIL/PENDING | Inspected evidence, observed result or unlock condition |
```

Include the commit SHA, and the EAS update group when this is a post-deploy
validation. Never call a bug fixed until the UI evidence and the log evidence
agree.
