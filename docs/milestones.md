# SmartFin milestone plan

Each milestone ends with a deployable checkpoint: CI is green, migrations have been reviewed, docs are updated and the build is tagged. Security, ownership, permissions, audit and the data model are designed up front (see [architecture](architecture.md), [ERD](erd.md) and [permissions](permissions.md)), not left for later.

Legend: ✅ done · 🟡 in progress · ⏳ blocked on an external step or approval · ⬜ not started

## M0 – Foundation

| Deliverable                                                                                                                         | Status                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Architecture proposal and ADRs, ERD, permission matrix, screen map, milestone plan                                                  | ✅                                                                                              |
| Monorepo (npm workspaces), TypeScript, ESLint, Prettier                                                                             | ✅                                                                                              |
| API skeleton: Express 5, config validation, structured logs and correlation ids, security headers, rate limiting, consistent errors | ✅                                                                                              |
| Health (`/api/v1/health`) and readiness (`/api/v1/health/ready`) endpoints                                                          | ✅                                                                                              |
| OpenAPI document and Swagger UI                                                                                                     | ✅                                                                                              |
| Database layer: Drizzle, PGlite (local/test), PostgreSQL (prod); first migration (users, sessions, audit events)                    | ✅                                                                                              |
| Shared package: money (decimal), Indian formatting, date helpers, API schemas                                                       | ✅                                                                                              |
| Web skeleton: design tokens (light/dark), app shell, status dashboard, not-found page                                               | ✅                                                                                              |
| Unit and integration tests (Vitest)                                                                                                 | ✅                                                                                              |
| CI workflow (lint, typecheck, test, build, `npm audit`), deploy workflow, release workflow                                          | ✅ written, ⏳ needs the GitHub secrets in the deployment guide                                 |
| `render.yaml` blueprint, `vercel.json`, deployment guide, `.env.example`                                                            | ✅                                                                                              |
| **Exit:** web and API deployed, health checks pass, secrets configured safely                                                       | ⏳ needs your GitHub, Vercel and Render accounts (see [deployment guide](deployment/README.md)) |

## M1 – Identity and family

**Done early (needed by M2):** sign-up, sign-in, sign-out, server-side sessions (cookie for web, bearer for Android), Argon2id, CSRF, auth rate limits, profile (name, time zone), privacy notice and consent record, audit events for auth, and owner-only isolation with tests (A1, A2, A11).

**Still to do:**

- Email verification, password reset, session list and revocation (password reset needs the email provider).
- Families: create, invite by email or link, accept, decline, revoke, resend; roles, ownership transfer, leave or remove.
- Sharing model: `visibility` / `family_access` / `sharing_grants` tables and the `authz` module with its SQL predicate builder.
- Audit events for every action in [permissions §7](permissions.md#7-exports-and-audit).
- Tests: authorization suite A1–A12 against a placeholder shared record type; Playwright e2e for sign-up → create family → invite → accept.
- **Approval needed:** an email provider for production verification and reset emails. Optional: a Google OAuth client.
- **Exit:** authorization tests pass, and private-data isolation is shown in an e2e run.

## M2 – Core money

| Deliverable                                                                                                                                                                                                     | Status                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Accounts (savings, salary, current, joint, cash, wallet), calculated balances, balance checks and reconciliation adjustments                                                                                    | ✅                                                                           |
| Transactions: expense, income, transfer, refund (plus system adjustments), ledger rules enforced in SQL constraints, categories (30 built-in plus custom), tags, references, search, filters, cursor pagination | ✅                                                                           |
| Soft delete and restore, field-level change history (audit), optimistic concurrency (409 on stale edits), duplicate warnings                                                                                    | ✅                                                                           |
| Income sources with expected vs received per month (monthly, quarterly, yearly, irregular)                                                                                                                      | ✅                                                                           |
| CSV/XLSX statement import: parse in the browser → match columns → duplicate check → commit with Idempotency-Key                                                                                                 | ✅                                                                           |
| Synthetic demo data (about 90 days, fictional banks and merchants) with load and reset                                                                                                                          | ✅                                                                           |
| Monthly report: income, spending net of refunds, savings rate, by category, payment method and account                                                                                                          | ✅                                                                           |
| Dashboard: liquid funds, monthly totals, spending by category, accounts, recent transactions, income status                                                                                                     | ✅                                                                           |
| Recurring transactions                                                                                                                                                                                          | ⬜ moved to M3 (needs the job runner)                                        |
| Receipts as attachments                                                                                                                                                                                         | ⏳ needs an object-storage provider (approval)                               |
| Bulk edit                                                                                                                                                                                                       | ⬜ moved to M6                                                               |
| Tests: 82 API (including isolation, ledger, import idempotency), 69 shared, 15 web                                                                                                                              | ✅                                                                           |
| **Exit:** account → expense → transfer → report flows work end to end; ledger tests pass                                                                                                                        | ✅ in API integration tests; browser e2e (Playwright) arrives with M1-family |

## M3 – Commitments

- Loans: schedule generator (reducing balance), editable installments, part-payment and prepayment, rate change, reschedule, closure.
- Credit cards: statements, minimum due, payments (as liability settlements), purchase-to-EMI plans.
- Chitty: contributions, dividends and penalties, auction payout with deductions breakdown, remaining obligations.
- Reminders: generated from schedules, in-app notification centre, snooze and complete, quiet hours, the job runner (ADR-008).
- Recurring transactions (moved from M2; they need the job runner).
- **Exit:** EMI and schedule unit tests match reference amortisation tables; due dates are right across month ends and IST time-zone boundaries.

## M4 – Wealth and planning

- FD/RD with maturity estimates (compounding conventions documented), installments, renewal and premature closure.
- SIP/MF: holdings, SIP plans and installments, manual NAV, absolute return and XIRR (method shown).
- Gold: holdings by kind, scheme contributions, manual rate per gram, valuation history.
- Budgets with thresholds; goals with contribution plans.
- Net worth service, following the inclusion rules in [architecture §3](architecture.md#3-calculations-and-provenance).
- **Exit:** every calculator has documented assumptions and tests; estimated values are labelled in the UI.

## M5 – Mobile

- Capacitor Android project in `apps/android`; signed debug and release builds; release APK as a GitHub release artifact.
- Bearer-token sessions, secure storage, back-button handling, offline read cache with sync on reconnect.
- Local notifications for reminders. Optional FCM push.
- Message assistant ([ADR-010](architecture.md#adr-010-android-transaction-message-assistant)): share/paste source, notification-listener source, optional SMS-receiver flavour; on-device deterministic parser with synthetic test fixtures; draft review queue; OTP and promo filtering; duplicate detection; local history and delete control.
- Privacy and consent documentation (`docs/privacy-and-consent.md`).
- **Needs on this PC:** JDK 21 and Android SDK, about 5–10 GB (we'll ask before installing). **Approval needed:** Play Console account (paid one-time fee) if distributing via Play; Firebase project if FCM push is wanted.
- **Exit:** APK installs on a device; opt-in, permission-denied and revoke flows verified.

## M6 – Insights and release

- Configurable dashboard (cards, hidden modules), charts, provenance and freshness labels.
- Reports catalogue with PDF/XLSX/CSV export (export permission checked and audited).
- Optional Firebase sync (ADR-011): implemented end-to-end or not shown.
- Security review (dependency audit, authz review, headers, rate limits), backup and restore drill, incident response runbook, user guide, known limitations.
- **Exit:** PRD §15 acceptance checklist complete; v1.0.0 tagged with release notes.

## Open approvals and decisions (summary)

| #   | Item                                                                 | Needed by            |
| --- | -------------------------------------------------------------------- | -------------------- |
| 1   | GitHub repository (name, visibility)                                 | M0 deploy            |
| 2   | Vercel project under team `adithyan-k`; Render account               | M0 deploy            |
| 3   | Render paid PostgreSQL (free tier expires after 30 days, no backups) | Before any real data |
| 4   | Email delivery provider                                              | M1 production        |
| 5   | Object storage provider                                              | M2                   |
| 6   | Android SDK install on this PC; Play Console (optional)              | M5                   |
| 7   | Firebase project (optional, FCM / sync)                              | M5 / M6              |
| 8   | Error tracking service (optional)                                    | M6                   |
