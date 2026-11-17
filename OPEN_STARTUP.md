# BooKoo open startup

BooKoo's vision is to **make money more valuable through transparency**. A
ledger app that asks a group to be open about its money should be open about
its own. This file is where the project publishes its numbers.

## What is published

| Area | Figure | Source of truth |
| --- | --- | --- |
| Revenue | Monthly store proceeds after store fees, per store | App Store Connect, Google Play Console |
| Subscriptions | Active Pro subscriptions at month end; new and cancelled in the month | IAPKit verified lifecycle events |
| Advertising | Monthly ad revenue | Ad network dashboards |
| Costs | Backend, developer programs, domains, tooling paid by the project | Invoices and billing dashboards |
| Usage | Monthly active users, active shared ledgers, entries created | Aggregate Convex rollups |

## Privacy rules

- Only aggregates are published. No figure ever identifies a person, a ledger
  or an entry.
- Any count below 10 is reported as `<10`.
- Usage figures come from server-side rollups, never from reading private
  ledger contents.
- Nothing here changes who can see a ledger: only its invited members.

## Cadence

Figures are published once per calendar month, after the stores close the
previous month's reports. Each report states its sources and the date they were
read. Corrections are made in place with a note, never silently.

## Reports

### Report 1 — baseline, read 2026-11-17

The first report is a baseline taken when the source code was opened, not a
calendar month. Monthly reports follow from December 2026.

**Revenue**

| Source | Period | Amount | Read from |
| --- | --- | --- | --- |
| App Store subscriptions | Launch to 2026-11-16 | $0 | App Store Connect → Trends → Proceeds, lifetime |
| Google Play subscriptions | Launch to 2026-11-16 | ₩0 (no revenue recorded) | Play Console → Financial reports → Revenue |
| Ads (AdMob) | October 2026 and November to date | $0 — ad serving is disabled on the account | AdMob home |
| Ads (LevelPlay banner) | October 2026 | $0.02 (iOS $0.02, Android $0) | LevelPlay → Reports → Performance, monthly by app |
| Ads (LevelPlay banner) | November 1–16, 2026 | $0.02 (iOS $0.02, Android $0) | Same |

**Subscriptions**

- Paid Pro subscriptions: 0. Neither store has recorded a charge.
- Free trials: 0. BooKoo's server has received no production trial event, and
  App Store Connect shows "Not Enough Data" for subscription plans.
- Complimentary Pro grants (not purchases): <10.

**Costs**

| Item | Cost | Note |
| --- | --- | --- |
| Convex (backend) | $25 / month | Professional plan for the whole hyo.dev team, shared with other projects. BooKoo used 39K function calls, 19 MB of database and 64 MB of files from Oct 23 to Nov 23, all inside the included quota, so it added no usage charge. |
| Vercel (website) | $0 | Hobby plan |
| GitHub | $0 | Public repository |
| Apple Developer Program | $99 / year | List price, shared by every app on the team |
| Google Play developer account | $25 once | List price, paid before launch |

**Usage** (signed-in accounts, internal test accounts excluded, read 2026-11-17 12:22 UTC)

| Metric | Value |
| --- | --- |
| Accounts active in the last 24 hours / 7 days / 28 days | 16 / 42 / 82 |
| Shared ledgers with at least two members | 25 |
| 28-day active accounts that belong to a shared ledger | 44 (54%) |

"Active" means the account's latest app presence falls in the window. These
are not store installs, anonymous users or calendar-month figures. Entries
created per month are not published yet: they need a new aggregate that does
not read private ledgers.
