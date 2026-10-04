# SmartFin — Product Requirements Document

Personal & Family Finance Management Platform
Agent-ready requirements • Web + Android • Render + Vercel + Git

| Document item    | Requirement                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| Purpose          | Build a secure, multi-user personal and family finance management system.                             |
| Web hosting      | Vercel (requested project/team: adithyan-k).                                                          |
| Backend hosting  | Render dashboard/service deployment.                                                                  |
| Source control   | Git repository, preferably GitHub; CI/CD from Git.                                                    |
| Database         | Backend-managed database by default; optional Firebase integration controlled by an explicit setting. |
| Mobile           | Android application/APK with consent-based transaction-message assistance.                            |
| Primary currency | INR (₹), configurable for future expansion.                                                           |
| Locale           | India-first; dates, numbers, financial conventions and time zone Asia/Kolkata.                        |

This document is the source of truth for the implementation agent. Build a working product, not only static screens. Use sensible defaults where details are not specified, document assumptions, and do not silently weaken security or consent requirements.

## 1. Product vision and goals

Create a unified financial workspace where an individual and authorized family members can record, understand, and plan their finances. The product must consolidate accounts, cash, income, expenses, investments, loans, credit cards, EMIs, chitty/chit-fund activity, budgets, reminders and reports.

- Give each person a private financial space and allow explicit sharing with a family group.
- Show personal and consolidated family views without double-counting transfers or shared assets.
- Work on the web and Android with a consistent experience and synchronized data.
- Use Render for backend hosting, Vercel for web hosting, and Git for source/version control. Do not make Firebase mandatory.
- Offer optional Firebase data storage/synchronization through a clear user-controlled setting; explain what data is sent and obtain consent before enabling it.
- On Android, optionally detect eligible bank transaction messages and propose a prefilled transaction for user review. Never silently create financial entries.

## 2. Scope and non-goals

### 2.1 In scope

- Multi-user registration, authentication, family invitations, account linking and permission controls.
- Manual entry, imports, balances, scheduled commitments, transaction tracking, dashboards, analytics and exports.
- Android APK, responsive web application, backend APIs, database, deployment pipeline and documentation.
- Opt-in SMS/notification transaction assistance subject to Android and Google Play policies.

### 2.2 Out of scope for initial release

- Direct bank login or credential collection; do not request internet-banking passwords, card PINs, CVVs or OTPs.
- Initiating payments, transferring money, placing investments, or making financial decisions on the user's behalf.
- Guaranteed live bank balances or market prices without a separately approved data provider.
- Automatic SMS access on web, iOS, or devices where platform permissions/policies do not allow it.

## 3. Platforms, architecture and technology

| Layer             | Required approach                                                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web frontend      | React + TypeScript; responsive UI; deploy production web app on Vercel.                                                                                                                        |
| Android           | Capacitor-based Android app using shared frontend where practical; produce signed APK/AAB. Native Android module may be used for permitted message parsing.                                    |
| Backend           | REST API (or documented equivalent) deployed on Render. Suggested stack: Node.js + TypeScript + Express/NestJS. Agent may propose an equivalent before implementation.                         |
| Database          | Primary database managed by backend, recommended PostgreSQL on Render or a compatible managed PostgreSQL provider. Keep data access behind backend APIs.                                       |
| Optional Firebase | A user/admin-controlled integration toggle for approved Firebase services only. Firebase must not be required for core operation. Clearly define exactly which data is synchronized and where. |
| Authentication    | Secure server-side session/JWT strategy; password hashing; optional Google sign-in. Never trust client-supplied roles.                                                                         |
| Files             | Private object/file storage for receipts and exports; use signed URLs and access checks.                                                                                                       |
| Hosting           | Vercel for web frontend; Render for API/background jobs. Configure domains, HTTPS, environment variables and health checks.                                                                    |
| Source control    | Git repository with main/develop/feature branches, pull requests, tags, release notes and CI checks.                                                                                           |
| Observability     | Structured logs, error tracking, uptime/health endpoint, audit events and backup/restore procedures.                                                                                           |

**Deployment boundary:** Vercel hosts the browser frontend; Render hosts backend APIs and background jobs. Secrets, database credentials and privileged operations must remain server-side. Do not put secrets in Vercel client environment variables.

## 4. Users, family groups and permissions

### 4.1 Account lifecycle

- Sign up with email/password; verify email; sign in/out; reset password; optional Google sign-in.
- Create user profile with display name, preferred currency, time zone and notification preferences.
- Create a family group or accept an invitation. A user may belong to more than one family only if supported safely and clearly.
- Invite by email or secure, expiring invitation link; allow accept, decline, revoke and resend.
- Support account linking as a relationship/permission link, not credential sharing or automatic access to another person's bank.

### 4.2 Roles and authorization

| Role         | Default capabilities                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------ |
| Family owner | Manage family, invite/remove members, assign permissions, view only records shared with owner.   |
| Family admin | Manage members and shared records as explicitly granted; cannot take ownership without transfer. |
| Member       | Manage own records; view/edit shared records according to permissions.                           |
| Read-only    | View permitted records and reports; no create/edit/delete.                                       |
| Custom       | Granular per-module and per-record permissions: view, create, edit, delete, export, share.       |

Every financial record must have an owner and visibility scope (private, selected people, or family-shared). A family relationship alone must not grant access to private data. Enforce authorization on every backend request and in database queries.

## 5. Functional requirements by module

### 5.1 Bank and account manager

- Create multiple accounts per user/family: savings, salary, current, joint, cash and wallet.
- Fields: nickname, institution, account type, owner, masked account reference, IFSC/branch (optional), opening balance/date, current balance, currency, status and notes.
- Record deposits, withdrawals, transfers, fees and balance adjustments; maintain dated transaction history and reconciliation.
- Support manual balance entry and CSV/XLSX statement import with preview, mapping, duplicate detection and user confirmation.
- Never store banking passwords, full card data, PIN or OTP. Mask account identifiers in UI and exports by default.

### 5.2 Family / spouse accounts

- Create separate profiles for spouse and other invited members; distinguish personal ownership from family-shared ownership.
- Link selected accounts to the family dashboard with owner label and access level.
- Allow member-controlled sharing and revocation. Show who can view/edit each shared record.
- Provide personal, spouse and combined family views; prevent duplicate aggregation of joint accounts.

### 5.3 Fixed deposits and recurring deposits

- FD fields: institution, owner, principal, rate, compounding/payout frequency, start/maturity dates, tenure, expected maturity value, nominee note, status and linked funding account.
- RD fields: monthly installment, due day, rate, start/end dates, total/paid/pending installments, expected maturity and missed-payment status.
- Track deposits, interest credited, renewals, premature closure and maturity proceeds as transactions.
- Show maturity calendar, upcoming installments, invested principal and estimated interest. Mark estimates clearly.

### 5.4 SIP and mutual fund tracker

- Capture fund/scheme, AMC, folio alias (masked), owner, SIP amount/frequency/debit date, start/end, units, NAV and transactions.
- Track installments as planned, paid, missed, paused or cancelled; allow manual NAV updates and optional approved market-data integration later.
- Calculate invested amount, current value when NAV is supplied, profit/loss and returns; label estimates and specify calculation method.
- Do not place orders or imply live valuation without a verified data source.

### 5.5 Gold savings and gold holdings

- Track physical gold, jewellery, digital gold and savings schemes separately.
- Fields: owner, item/scheme, weight in grams, purity, purchase date/value, making charges, taxes, current rate source/date, estimated value and notes.
- Track monthly scheme contributions, redemption, sale and valuation history. Show estimated value separately from cash balance.

### 5.6 Loans and EMI manager

- Loan types: home, vehicle, personal, education, gold, business and custom.
- Capture lender, owner, principal, disbursed amount, rate, rate type, tenure, start date, EMI amount/due date, outstanding principal and linked account.
- Generate an editable repayment schedule with installment number, due date, principal, interest, fees, paid amount, payment date and status.
- Track part-payment, prepayment, missed/late payment, rate change, rescheduling and closure.
- Show upcoming EMIs, total monthly debt commitment, principal outstanding and interest paid. Calculations must state assumptions and support manual correction.

### 5.7 Credit cards and card EMIs

- Manage multiple cards with issuer, nickname, owner, masked last four digits, limit, statement date, due date, outstanding, available limit and status.
- Track purchases, refunds, fees, payments, statement balance, minimum due and payment confirmation.
- Create purchase-to-EMI plans with principal, interest/rate, fees, tenure, monthly installment, start/end dates, paid and remaining installments.
- Prevent double counting: card purchase is an expense; paying the card is a liability settlement/transfer, not a second expense.
- Never store CVV, PIN, full PAN or OTP. Display utilization as an estimate based on user-maintained figures.

### 5.8 Cash / in-hand balance

- Track physical cash, wallet and other manually maintained liquid balances.
- Record cash received, cash spent, cash transfer and reconciliation adjustment.
- Show available funds using latest entered balances and label freshness/last updated time.
- Separate current liquid funds from investments and from money already committed to upcoming bills.

### 5.9 Daily expense and transaction tracker

- Create income, expense, transfer, refund, adjustment and liability-payment transaction types.
- Fields: amount, currency, date/time, category, description, payer/owner, payment method, account/card/cash source, merchant, tags, notes and optional receipt.
- Support recurring transactions, search, filters, bulk edit where safe, attachments, category customization and CSV/XLSX import.
- Provide daily, weekly, monthly and yearly views; category, person, account and payment-method breakdowns.
- Support transaction review, correction, soft delete, audit history and duplicate detection.

### 5.10 Multiple income sources

- Track salary, spouse income, freelance, business, rent, interest, dividends, bonus, refunds and custom sources.
- Capture expected vs received amount, source, recipient, date, frequency, receiving account and tax/notes fields.
- Show monthly/annual income, source mix, pending expected income and family/member summaries.

### 5.11 Chitty / chit-fund tracker

- Create multiple schemes with provider, ticket/reference, total value, installment, duration, start/end, owner and linked payment account.
- Track each contribution with due date, amount, paid date, status, penalty/commission and receipt.
- Track auction/withdrawal date, gross prize amount, deductions, net received amount, receiving account and remaining obligations.
- Show total contributed, total received, future installments and cash-flow impact. Do not label gross withdrawal as profit; explain calculation and deductions.

### 5.12 Budgets, savings goals and planning

- Create monthly or custom-period budgets by category, person or family.
- Set goals for emergency fund, house, vehicle, education, travel, retirement and custom purposes.
- Track target, saved amount, deadline, contribution plan and progress.
- Notify on configurable budget thresholds and show planned vs actual cash flow.

### 5.13 Reminders and calendar

- Create reminders for EMI, card due date, SIP, RD, chitty, FD maturity, recurring bill and custom event.
- Support in-app and Android push notifications; email optional.
- Allow snooze, mark complete, edit recurrence and configure quiet hours.
- Notifications must not expose sensitive amounts on a locked screen unless the user enables it.

### 5.14 Reports and exports

- Generate monthly/yearly income-expense, account statement, net worth, investment, loan schedule, card due, chitty, budget and family reports.
- Filters: date range, member, family, account, category, module and status.
- Export PDF, XLSX and CSV. Apply permission checks to exports and record export audit events.
- Provide report definitions and calculation notes; distinguish actual, estimated and forecast values.

### 5.15 Dashboard and analytics

- Personal, spouse/member and consolidated family dashboard.
- Cards: liquid balance, net worth, assets, liabilities, monthly income/expense, savings rate, monthly EMI, card dues, investments, chitty commitments and upcoming payments.
- Charts: income vs expense, category spend, asset/liability mix, investment allocation and net-worth trend.
- Net worth = eligible assets minus liabilities. Avoid counting transfers twice and avoid treating credit limits as assets.
- Show data freshness and whether values are manual, imported, estimated or externally sourced.

### 5.16 AI assistant (optional staged capability)

- Allow natural-language questions over only the current user's authorized data, e.g. "What payments are due this month?"
- Provide transparent calculations, source records and date range; never fabricate missing financial facts.
- Require confirmation before creating or modifying a transaction based on AI suggestions.
- Do not send financial data to an external AI provider unless the user/admin explicitly enables it and receives a clear data disclosure.
- AI output is informational, not regulated financial advice; include appropriate disclaimers.

## 6. Android transaction-message assistant (opt-in)

Goal: reduce manual entry by detecting eligible transaction notifications/messages and preparing a draft transaction. This feature must be optional, privacy-first, and compliant with Android platform rules and Google Play policies. The app must not assume it can freely read all SMS on every Android version or distribution channel.

### 6.1 User experience

- Provide a dedicated setting: "Transaction message assistant" with a prominent ON/OFF toggle, default OFF.
- Before enabling, show a plain-language explanation of what is accessed, what is processed, what is stored, and how to turn it off.
- Request only the minimum Android permission that is legally/platform-policy permitted for the chosen distribution method. If SMS permission is not eligible, use notification listener only with explicit user enablement, or provide share/import/manual alternatives.
- Process supported transaction messages on-device where possible. Do not upload raw message content by default.
- Recognize likely debit, credit, UPI, card, ATM, bank transfer and wallet transaction alerts; extract amount, direction, merchant/description, date/time, account/card last four digits and reference ID when present.
- Show a draft review screen with extracted fields, confidence indicator and source category. User must tap Confirm to save.
- Allow edit, ignore, mark as duplicate, and report incorrect parsing. Never auto-post an expense or income without explicit per-user opt-in and a separately designed confirmation policy.
- Ignore OTPs, authentication codes, balance-only alerts, promotional messages and unrelated personal messages. Never extract or store OTPs.
- Support duplicate detection using reference ID, amount, date, account and message fingerprint; do not rely on amount alone.
- Provide a local processing history and "Delete message-derived data" control. Turning the feature OFF stops future processing and explains what already-saved transactions remain.
- If a message contains a balance, treat it as a separate optional balance observation, not a transaction, and require review.

### 6.2 Parsing and safety requirements

- Use deterministic parsing rules first; optional on-device or approved server-side AI may assist only after explicit disclosure and consent.
- Never use an SMS body as executable instructions or trust links contained in messages.
- Do not collect full card numbers, account credentials, PINs or OTPs.
- Store only normalized transaction fields after confirmation; raw message text should not be retained unless the user explicitly chooses diagnostic sharing.
- Make parsing rules testable with redacted fixtures for multiple banks, UPI providers, languages and message formats.
- Provide fallback manual entry when permission is denied, unsupported, or revoked.
- The implementation agent must verify current Android and Play policy before selecting SMS/notification permissions and distribution strategy. If policy does not permit SMS reading for this app category, do not circumvent it; use notification access only where permitted or user-initiated sharing/import.

### 6.3 Acceptance criteria

- Feature is OFF by default and cannot be enabled without an explanation and OS permission.
- No raw SMS is sent to Render, Vercel, Firebase or an AI provider by default.
- An eligible test message produces a draft, not a saved transaction, until user confirmation.
- OTP/promotional/non-transaction messages are ignored and not retained.
- Duplicate drafts are detected; user can edit or dismiss.
- Revoking permission or switching OFF stops further collection.
- Manual transaction entry remains fully functional without this feature.

## 7. Data model and data governance

Design a relational schema (recommended PostgreSQL) with stable IDs, ownership, family scope, timestamps, soft-delete/audit fields and currency precision. Use decimal/numeric types for money; never floating-point for persisted financial amounts.

| Entity                          | Key fields / relationships                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| users                           | id, email, display_name, preferences, created_at                                          |
| families                        | id, name, owner_user_id, base_currency                                                    |
| family_members                  | family_id, user_id, role, status, permissions                                             |
| sharing_grants                  | record_type, record_id, grantor, grantee, permissions, expiry/revocation                  |
| accounts                        | owner_id, family_id, type, masked_reference, opening_balance, current_balance, visibility |
| transactions                    | owner_id, family_id, account_id, type, amount, currency, date, category, source, status   |
| investments                     | owner_id, family_id, investment_type, terms, valuation and linked transactions            |
| loans / loan_installments       | loan terms and installment-level schedule/status                                          |
| credit_cards / card_emis        | masked card metadata, statement cycle, EMI plan and installments                          |
| chitty_schemes / chitty_entries | scheme terms, contributions, auction/withdrawal records                                   |
| budgets / goals                 | scope, category, target, period, progress                                                 |
| reminders / notifications       | user, related record, due date, channel, status                                           |
| attachments                     | owner, related record, private storage key, content type, size                            |
| audit_events                    | actor, action, entity, timestamp, safe before/after metadata                              |
| integrations                    | provider, enabled state, consent version, scopes, last sync, disconnect state             |

- Use database migrations and seed data for demo/testing; never seed real personal data.
- Store all timestamps in UTC and render in the user's configured time zone (default Asia/Kolkata). Store financial dates separately where appropriate.
- Use decimal precision and explicit currency codes. Support INR first.
- Define retention, export and account deletion workflows. Explain limits where legal/audit retention applies.
- Backups must be encrypted, tested, and documented with recovery objectives.
- Use least-privilege database credentials and parameterized queries.

## 8. Optional Firebase storage integration

Firebase is optional, not the primary architecture. Provide an explicit toggle in Settings > Data & Sync, visible only to an authorized owner/admin where appropriate.

| Setting                | Expected behavior                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Use Firebase sync: OFF | Application uses the configured primary backend/database only. No Firebase data transfer.                                   |
| Use Firebase sync: ON  | Show provider, data categories, purpose, sync direction, retention and consent; require confirmation before connecting.     |
| Choose data scope      | Allow selecting eligible categories. Do not sync secrets, raw SMS, credentials or sensitive attachments by default.         |
| Disconnect             | Stop future sync, revoke tokens where possible, show what remains at each provider and offer deletion instructions/actions. |
| Sync status            | Show last successful sync, errors, conflict count and retry option.                                                         |

The agent must specify whether Firebase is used for authentication, push notifications, analytics, storage or database. The toggle must not misleadingly imply that turning on a Firebase SDK automatically moves the primary database. Implement a real, documented integration or omit the toggle until it is functional.

## 9. Security, privacy and compliance

- HTTPS everywhere; secure headers; rate limiting; input validation; CSRF protection where cookie sessions are used.
- Strong password hashing (Argon2id or bcrypt with appropriate parameters), secure token rotation and revocation.
- Server-side authorization on every route; tenant/family isolation tests; deny by default.
- Encrypt sensitive fields at rest where appropriate; use managed secrets and key rotation.
- No secrets, private keys, production data or service account files in Git.
- Mask account/card identifiers; do not store CVV, PIN, passwords or OTPs.
- Audit sensitive actions: login/security changes, sharing changes, exports, deletions and financial edits.
- Provide privacy notice, consent records, data export and account deletion.
- Do not claim regulatory compliance without legal review. Validate applicable Indian privacy, financial-data and platform requirements before production.

## 10. UX and accessibility

- Clean, modern, mobile-first design with consistent navigation and clear financial hierarchy.
- Support light/dark themes, accessible contrast, keyboard navigation and screen-reader labels.
- Use clear empty states, inline validation, confirmation for destructive actions and undo where feasible.
- Use Indian number formatting (₹1,23,456.78), configurable date format and searchable selectors.
- Show "actual", "estimated", "forecast", "imported" and "last updated" labels wherever relevant.
- Do not overload the home screen; allow users to configure dashboard cards and hide modules they do not use.

## 11. API and integration requirements

- Publish versioned API routes (e.g. /api/v1) with OpenAPI/Swagger documentation.
- Use pagination, filtering, sorting and consistent error responses.
- Validate all request bodies and enforce ownership/permissions server-side.
- Use idempotency keys for imports and operations that could be retried.
- Provide health/readiness endpoints for Render and structured logs with correlation IDs.
- Use background jobs for scheduled reminders, imports and report generation; jobs must be retry-safe.
- Use webhooks only with signature validation and replay protection.

## 12. Git, CI/CD and deployment

### 12.1 Repository structure

```
smartfin/
  apps/
    web/                 # React web application
    android/             # Capacitor Android project
  services/
    api/                 # Render backend API
    worker/              # scheduled/background jobs (if separate)
  packages/
    shared/              # types, validation, shared utilities
  database/
    migrations/
    seeds/
  docs/
    PRD.md
    architecture.md
    api/
    deployment/
    privacy-and-consent.md
  tests/
    unit/
    integration/
    e2e/
  .github/workflows/
  README.md
  .env.example
```

### 12.2 Branching and automation

- main: production-ready; develop: integration; feature/* and fix/*: short-lived branches.
- Require pull request review and passing lint, type-check, unit and security checks before merge.
- On merge, deploy web to Vercel and backend to Render using protected environment configuration.
- Never deploy unreviewed migrations to production. Include migration backup/rollback guidance.
- Tag releases (v1.0.0) and publish release notes. Store APK as a release artifact; do not commit generated secrets or signing keys.
- Use GitHub Actions for test/build and release workflows. Keep Vercel/Render deployment tokens in repository secrets.

### 12.3 Environments

| Environment       | Purpose                                                                                |
| ----------------- | -------------------------------------------------------------------------------------- |
| Local             | Developer setup with .env.example and local/test database.                             |
| Preview / staging | Vercel preview + Render staging service/database; synthetic test data only.            |
| Production        | Vercel production + Render production service/database; restricted access and backups. |

The agent must provide exact deployment instructions for the Vercel project/team and Render service, required environment variables, database provisioning, domain/HTTPS setup, migration execution and rollback.

## 13. Testing strategy

- Unit tests for money calculations, EMI schedules, interest estimates, net worth, recurring dates and duplicate detection.
- API integration tests for authentication, permissions, family isolation, CRUD, imports, exports and audit events.
- End-to-end tests for registration, family invitation, account creation, expense entry, loan/EMI, credit card, chitty, dashboard and reports.
- Security tests: user A cannot access user B private data; family member sees only granted data; revoked access stops immediately.
- Mobile tests for Android permissions, offline behavior, sync, back button, notifications and APK installation.
- SMS parser tests use synthetic/redacted messages; test OTP, marketing, ambiguous and malformed messages are ignored.
- Test decimal rounding, timezone boundaries, duplicate imports, concurrent edits and recovery from network failure.
- Do not use actual bank messages or real financial data in automated test fixtures.

## 14. Delivery milestones

| Milestone               | Deliverables                                                                                       | Exit criteria                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| M0 – Foundation         | Architecture decision record, repo, CI, Vercel/Render skeleton, database migrations, design system | Web and API deploy; health checks pass; secrets configured safely.      |
| M1 – Identity & family  | Registration, login, family creation/invites, roles, sharing controls                              | Authorization tests pass; private data isolation demonstrated.          |
| M2 – Core money         | Accounts, cash, transactions, income, expenses, imports                                            | End-to-end transaction flows and reports work.                          |
| M3 – Commitments        | Loans/EMI, credit cards/card EMI, chitty, reminders                                                | Schedules, due dates and payment status validated.                      |
| M4 – Wealth             | FD/RD, SIP, gold, goals and net worth                                                              | Calculations documented; estimated values labeled.                      |
| M5 – Mobile             | Capacitor Android app, optional message assistant, push, offline read/sync                         | APK installs; opt-in and permission behavior verified.                  |
| M6 – Insights & release | Dashboard, exports, optional Firebase toggle, security review, production docs                     | Acceptance criteria met; production deployment and rollback documented. |

Milestones may overlap, but do not defer security, ownership, permissions, data model or audit design until later phases.

## 15. Acceptance criteria for initial production release

- [ ] Web app is live on Vercel and backend API is live on Render over HTTPS.
- [ ] Source is in Git with documented setup, environment variables, branch strategy and release process.
- [ ] Android APK can be built reproducibly and installed on a supported Android device.
- [ ] Users can register, authenticate, create a family, invite members and manage granular permissions.
- [ ] Private, shared and family-level records are separated and verified by automated authorization tests.
- [ ] Users can manage multiple bank/cash accounts, transactions, expenses and income.
- [ ] Users can manage FD/RD, SIP, gold, loans/EMIs, credit cards/card EMIs and chitty contributions/withdrawals.
- [ ] Dashboard shows liquid funds, assets, liabilities, commitments and net worth without double counting.
- [ ] Reports export to PDF/XLSX/CSV and respect access permissions.
- [ ] Reminders work in-app and on Android where permission is granted.
- [ ] Firebase is not required. If the optional toggle is presented, it performs a real consented integration and accurately reports sync status.
- [ ] Transaction-message assistant is OFF by default, permission-gated, privacy-preserving and always requires review before saving.
- [ ] No raw SMS, OTP, card CVV/PIN, bank credentials or production secrets are stored or committed.
- [ ] Backup, restore, account deletion, audit and incident-response procedures are documented.

## 16. Required deliverables from the implementation agent

- Working responsive web application and Android application source.
- Backend API source deployed on Render and web frontend deployed on Vercel.
- Git repository with clean commit history, README and tagged release.
- Database schema, migrations, indexes, seed/demo data and backup instructions.
- OpenAPI documentation and architecture diagram.
- Role/permission matrix and security rules/tests.
- Android APK (and AAB if requested), signing/build instructions and release notes.
- Automated unit, integration and end-to-end tests with execution report.
- Deployment guide for Vercel and Render, including environment variable list and rollback procedure.
- User guide covering family setup, sharing, data entry, imports, reminders, exports and optional message assistant.
- Privacy/consent documentation, especially for SMS/notification access and optional Firebase sync.
- Known limitations and future roadmap.

## 17. Implementation instructions to the agent

Before coding, inspect this PRD and produce a concise architecture proposal, database ERD, permission matrix, screen map and milestone plan. Identify any platform-policy or hosting constraints early. Then implement in small, reviewable increments with working tests and deployable checkpoints.

- Do not replace Render or Vercel with Firebase. Firebase is optional only as described.
- Do not build a Firebase-only frontend that bypasses the Render API for privileged operations.
- Do not create mock-only buttons or screens; every delivered control must work or be clearly marked "not yet available".
- Use realistic synthetic demo data and provide a reset option.
- Ask for approval before adding paid services, external financial data providers, AI providers or recurring costs.
- Do not claim automatic bank synchronization. Clearly distinguish manual entry, statement import, message-derived draft and verified external integration.
- Keep financial calculations explainable, testable and configurable; never present projections as guaranteed outcomes.

## Appendix A – Suggested dashboard formulas

| Metric              | Definition / caveat                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Liquid funds        | Latest bank + cash + wallet balances, excluding investments; label stale/manual values.                                                       |
| Net worth           | Eligible assets (cash, accounts, investments, estimated gold) minus liabilities (loan principal and card outstanding). Avoid double counting. |
| Monthly savings     | Recognized income minus recognized expenses for selected period; transfers excluded.                                                          |
| Savings rate        | Monthly savings divided by recognized income; define behavior when income is zero.                                                            |
| Monthly commitments | Scheduled EMIs + card EMI + SIP + RD + chitty + recurring bills; show categories separately.                                                  |
| Card utilization    | Outstanding divided by credit limit; estimate only from entered/imported values.                                                              |
| Loan outstanding    | Latest principal balance or calculated schedule balance, clearly identify which is used.                                                      |

## Appendix B – Key product principles

- Privacy by default; sharing is explicit and revocable.
- User confirmation for message-derived transactions and consequential changes.
- One source of truth for each record; transfers and settlements must not inflate income/expense.
- Clear separation of actual balances, estimates, forecasts and external data.
- Portable data: user can export their records in common formats.
- No hidden data collection; every integration has visible status and controls.
