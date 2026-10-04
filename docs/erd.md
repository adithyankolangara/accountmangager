# SmartFin data model (ERD)

Status: **Design for all milestones.** Tables are created by migrations in the milestone that first uses them; the [milestones](milestones.md) list which. Conventions are in [architecture ADR-006/007](architecture.md#adr-006-money-dates-and-time).

## Conventions

- **Primary keys:** `uuid` (`gen_random_uuid()`).
- **Hashes and emails:** hashes are hex `text`. Emails are `text` with a lower-case check constraint, so no extension (citext) is needed and PGlite stays compatible.
- **Timestamps:** `created_at`, `updated_at` as `timestamptz` (UTC). Soft delete through `deleted_at`. Optimistic concurrency through `version int`; an update must send the version it read.
- **Ownership block**, on every financial table (shown as `OWNED` below):
  `owner_id → users`, `family_id → families (nullable)`, `visibility ('private'|'selected'|'family')`, `family_access ('view'|'edit')`, `created_by`, `updated_by`.
- **Money:** `numeric(18,2)` plus `currency char(3)`. Rates `numeric(9,4)` (percent per annum). Units, grams and NAV `numeric(18,4)`.
- **Provenance:** `value_source ('manual'|'imported'|'message_draft'|'calculated'|'external')` plus `as_of` wherever a balance or valuation is stored.
- **Masking:** only the **last four digits** of account, card and folio numbers are stored (`char(4)`). No full numbers, CVV, PIN, OTP or passwords are stored anywhere.
- **Polymorphic links** (`entity_type`, `entity_id`) are used only for cross-cutting tables (sharing grants, attachments, reminders, audit). `entity_type` is a checked enum.

## 1. Identity, family and sharing

```mermaid
erDiagram
  users ||--o{ user_sessions : has
  users ||--o{ email_tokens : has
  users ||--o{ auth_identities : "links (Google)"
  users ||--o{ family_members : joins
  families ||--o{ family_members : has
  families ||--o{ family_invitations : issues
  users ||--o{ sharing_grants : "grants / receives"
  users ||--o{ consents : records
  users ||--o{ audit_events : acts

  users {
    uuid id PK
    text email UK "stored lower-cased"
    timestamptz email_verified_at
    text password_hash "argon2id, nullable for Google-only"
    text display_name
    char3 preferred_currency "INR"
    text time_zone "Asia/Kolkata"
    jsonb preferences "dashboard cards, hidden modules, notification prefs, quiet hours, lock-screen amounts"
    timestamptz deleted_at
  }
  user_sessions {
    uuid id PK
    uuid user_id FK
    text token_hash UK "sha256 hex"
    text client "web|android"
    text user_agent
    timestamptz last_seen_at
    timestamptz idle_expires_at
    timestamptz absolute_expires_at
    timestamptz revoked_at
  }
  email_tokens {
    uuid id PK
    uuid user_id FK
    text purpose "verify_email|reset_password"
    text token_hash UK "sha256 hex"
    timestamptz expires_at
    timestamptz used_at
  }
  auth_identities {
    uuid user_id FK
    text provider "google"
    text provider_subject UK
  }
  families {
    uuid id PK
    text name
    uuid owner_user_id FK
    char3 base_currency
  }
  family_members {
    uuid family_id PK, FK
    uuid user_id PK, FK
    text role "owner|admin|member|read_only|custom"
    jsonb permissions "custom role: module -> actions[]"
    text status "active|removed|left"
  }
  family_invitations {
    uuid id PK
    uuid family_id FK
    text email "lower-cased"
    text role
    text token_hash UK "sha256 hex"
    uuid invited_by FK
    timestamptz expires_at
    text status "pending|accepted|declined|revoked|expired"
  }
  sharing_grants {
    uuid id PK
    text record_type
    uuid record_id
    uuid grantor_id FK
    uuid grantee_id FK
    text_arr permissions "view|edit|delete|export|share"
    timestamptz expires_at
    timestamptz revoked_at
  }
  consents {
    uuid id PK
    uuid user_id FK
    text kind "privacy_notice|message_assistant|firebase_sync|ai_assistant"
    text version
    timestamptz granted_at
    timestamptz withdrawn_at
  }
  audit_events {
    uuid id PK
    uuid actor_user_id FK
    uuid family_id
    text action
    text entity_type
    uuid entity_id
    text request_id
    jsonb metadata "safe before/after, never secrets"
    timestamptz created_at
  }
```

## 2. Core money (accounts, cash, transactions, income)

```mermaid
erDiagram
  accounts ||--o{ transactions : "account_id"
  accounts ||--o{ transactions : "counter_account_id (transfers)"
  accounts ||--o{ balance_observations : has
  categories ||--o{ transactions : classifies
  categories ||--o{ categories : parent
  recurring_rules ||--o{ transactions : generates
  import_batches ||--o{ transactions : imports
  income_sources ||--o{ transactions : "received as (income_source_id)"

  accounts {
    uuid id PK
    OWNED ownership
    text kind "savings|salary|current|joint|cash|wallet"
    text nickname
    text institution
    char4 masked_reference "last 4 only"
    text ifsc
    text branch
    numeric opening_balance
    date opening_date
    char3 currency
    text status "active|closed"
  }
  transactions {
    uuid id PK
    OWNED ownership
    bigint seq "insertion order; stable pagination"
    text type "income|expense|transfer|refund|adjustment|liability_payment"
    numeric amount "always > 0; direction from type"
    char3 currency
    timestamptz occurred_at "optional exact time"
    date value_date "financial date"
    uuid account_id FK "source (or destination for income)"
    uuid counter_account_id FK "transfer target"
    uuid card_id FK "card purchase / card payment target"
    uuid category_id FK
    uuid income_source_id FK
    text payment_method "upi|debit_card|credit_card|netbanking|cash|cheque|auto_debit|other"
    text reference "UTR/RRN/cheque no."
    text merchant
    text description
    text_arr tags
    text source "manual|import|demo|message_draft|recurring|system"
    text status "pending|cleared|reconciled"
    text linked_entity_type "loan_installment|card_emi_installment|chitty_entry|deposit_installment|sip_installment|goal"
    uuid linked_entity_id
    uuid import_batch_id FK
    uuid recurring_rule_id FK
    text direction "in|out, adjustments only"
    timestamptz deleted_at
  }
  balance_observations {
    uuid id PK
    uuid account_id FK
    numeric balance
    timestamptz observed_at
    text source "manual|import|message_draft"
  }
  categories {
    uuid id PK
    uuid owner_id "null = system default"
    uuid family_id
    uuid parent_id FK
    text kind "income|expense"
    text name
  }
  recurring_rules {
    uuid id PK
    OWNED ownership
    jsonb template "transaction fields"
    text frequency "daily|weekly|monthly|yearly"
    int interval
    date next_run_on
    date ends_on
  }
  import_batches {
    uuid id PK
    uuid owner_id FK
    uuid account_id FK
    text file_name
    jsonb column_mapping
    text status "uploaded|previewed|committed|failed"
    text idempotency_key UK
    int rows_total
    int rows_imported
    int rows_duplicate
  }
  income_sources {
    uuid id PK
    OWNED ownership
    text kind "salary|business|freelance|rent|interest|dividend|bonus|pension|other"
    text name
    numeric expected_amount
    text frequency "monthly|quarterly|yearly|irregular"
    date start_date "anchor for quarterly/yearly"
    smallint expected_day
    uuid receiving_account_id FK
    text tax_notes
    bool active
    bool is_demo
  }
```

As built in M2:

- **Balances are calculated, not stored:** opening balance plus every non-deleted transaction dated from the opening date to today (`services/api/src/modules/ledger.ts`). A stored balance could drift; a calculation can't.
- **Expected vs received** is calculated per month: expected from the source's amount and frequency, received from income transactions linked by `income_source_id`. There is no separate expectations table to keep in sync.
- **Duplicates** are found by query (same account, type and amount within 2 days, then compared by reference or date and description), so there is no stored fingerprint yet. Message drafts (M5) may add one.
- `accounts.is_demo`, `income_sources.is_demo` and `transactions.source = 'demo'` mark synthetic data so reset removes exactly that.

Ledger rules:

- `income` adds to `account_id`. `expense` subtracts from `account_id`, or adds to the card outstanding when `card_id` is set.
- `transfer` moves money `account_id` → `counter_account_id`. `liability_payment` moves money `account_id` → `card_id`, or to a loan installment through `linked_entity`.
- `refund` reverses an expense. `adjustment` reconciles to an observed balance.
- Only `income` and `expense` (net of `refund`) count toward income and expense totals.

## 3. Commitments (loans, cards, chitty)

```mermaid
erDiagram
  loans ||--o{ loan_installments : schedules
  loans ||--o{ loan_events : records
  credit_cards ||--o{ card_statements : bills
  credit_cards ||--o{ card_emis : converts
  card_emis ||--o{ card_emi_installments : schedules
  chitty_schemes ||--o{ chitty_entries : has
  chitty_schemes ||--o{ chitty_payouts : pays

  loans {
    uuid id PK
    OWNED ownership
    text kind "home|vehicle|personal|education|gold|business|custom"
    text lender
    numeric principal
    numeric disbursed_amount
    numeric annual_rate
    text rate_type "fixed|floating"
    int tenure_months
    date start_date
    numeric emi_amount
    int emi_day
    numeric outstanding_principal
    text outstanding_source "calculated|manual"
    timestamptz outstanding_as_of
    uuid linked_account_id FK
    text status "active|closed|foreclosed"
  }
  loan_installments {
    uuid id PK
    uuid loan_id FK
    int seq
    date due_date
    numeric principal_component
    numeric interest_component
    numeric fees
    numeric total_due
    numeric paid_amount
    date paid_on
    text status "upcoming|due|paid|partial|missed|late"
    bool manually_edited
    uuid transaction_id FK
  }
  loan_events {
    uuid id PK
    uuid loan_id FK
    text kind "part_payment|prepayment|rate_change|reschedule|closure"
    date effective_date
    numeric amount
    numeric new_rate
    text recalc_mode "reduce_emi|reduce_tenure"
  }
  credit_cards {
    uuid id PK
    OWNED ownership
    text issuer
    text nickname
    char4 last4
    numeric credit_limit
    int statement_day
    int due_day
    numeric outstanding
    timestamptz outstanding_as_of
    text status "active|blocked|closed"
  }
  card_statements {
    uuid id PK
    uuid card_id FK
    date period_start
    date period_end
    numeric statement_balance
    numeric minimum_due
    date due_date
    numeric paid_amount
    text status "open|paid|partial|overdue"
  }
  card_emis {
    uuid id PK
    uuid card_id FK
    uuid purchase_transaction_id FK
    numeric principal
    numeric annual_rate
    numeric processing_fee
    int tenure_months
    numeric emi_amount
    date start_date
    text status "active|closed|foreclosed"
  }
  card_emi_installments {
    uuid id PK
    uuid card_emi_id FK
    int seq
    date due_date
    numeric principal_component
    numeric interest_component
    numeric tax
    text status
  }
  chitty_schemes {
    uuid id PK
    OWNED ownership
    text provider
    text reference
    numeric total_value
    numeric installment_amount
    int duration_months
    date start_date
    date end_date
    uuid payment_account_id FK
    text status "active|won|completed|exited"
  }
  chitty_entries {
    uuid id PK
    uuid scheme_id FK
    int seq
    date due_date
    numeric amount_due
    numeric dividend_received "reduction in installment"
    numeric penalty
    date paid_on
    text status "upcoming|paid|missed|late"
    uuid transaction_id FK
  }
  chitty_payouts {
    uuid id PK
    uuid scheme_id FK
    date auction_date
    numeric gross_prize
    numeric auction_discount
    numeric foreman_commission
    numeric other_deductions
    numeric net_received
    uuid receiving_account_id FK
    uuid transaction_id FK
  }
```

## 4. Wealth (deposits, mutual funds, gold) and planning

```mermaid
erDiagram
  deposits ||--o{ deposit_installments : "RD installments"
  mf_holdings ||--o{ sip_plans : funds
  sip_plans ||--o{ sip_installments : schedules
  mf_holdings ||--o{ mf_transactions : records
  gold_holdings ||--o{ gold_scheme_contributions : "scheme only"
  asset_valuations }o--|| mf_holdings : values
  asset_valuations }o--|| gold_holdings : values
  budgets ||--o{ budget_lines : has
  goals ||--o{ goal_contributions : has

  deposits {
    uuid id PK
    OWNED ownership
    text kind "fd|rd"
    text institution
    numeric principal "FD"
    numeric installment_amount "RD"
    int due_day "RD"
    numeric annual_rate
    text compounding "monthly|quarterly|half_yearly|yearly|simple"
    text payout "cumulative|monthly|quarterly|yearly"
    date start_date
    date maturity_date
    int tenure_months
    numeric expected_maturity_value "calculated"
    uuid funding_account_id FK
    text nominee_note
    text status "active|matured|renewed|closed_premature"
  }
  deposit_installments {
    uuid id PK
    uuid deposit_id FK
    int seq
    date due_date
    numeric amount
    text status "upcoming|paid|missed"
    uuid transaction_id FK
  }
  mf_holdings {
    uuid id PK
    OWNED ownership
    text scheme_name
    text amc
    char4 folio_last4
    numeric units
    numeric last_nav
    date nav_date
    text nav_source "manual|external"
  }
  sip_plans {
    uuid id PK
    uuid holding_id FK
    numeric amount
    text frequency "monthly|quarterly|weekly"
    int debit_day
    date start_date
    date end_date
    uuid debit_account_id FK
    text status "active|paused|cancelled|completed"
  }
  sip_installments {
    uuid id PK
    uuid sip_plan_id FK
    date due_date
    numeric amount
    numeric units_allotted
    numeric nav
    text status "planned|paid|missed|paused|cancelled"
    uuid transaction_id FK
  }
  mf_transactions {
    uuid id PK
    uuid holding_id FK
    text kind "purchase|redemption|switch_in|switch_out|dividend"
    date trade_date
    numeric amount
    numeric units
    numeric nav
  }
  gold_holdings {
    uuid id PK
    OWNED ownership
    text kind "physical|jewellery|digital|scheme"
    text item_name
    numeric weight_grams
    text purity "24K|22K|18K|999|916"
    date purchase_date
    numeric purchase_value
    numeric making_charges
    numeric taxes
    text status "held|sold|redeemed"
  }
  gold_scheme_contributions {
    uuid id PK
    uuid holding_id FK
    date due_date
    numeric amount
    numeric grams_credited
    text status
    uuid transaction_id FK
  }
  asset_valuations {
    uuid id PK
    text entity_type "mf_holding|gold_holding"
    uuid entity_id
    numeric unit_price "NAV or rate per gram"
    numeric value
    date as_of
    text source "manual|external"
    text source_note
  }
  budgets {
    uuid id PK
    OWNED ownership
    text scope "person|family"
    text period "monthly|custom"
    date start_date
    date end_date
    int_arr alert_thresholds "e.g. 80,100"
  }
  budget_lines {
    uuid id PK
    uuid budget_id FK
    uuid category_id FK
    numeric amount
  }
  goals {
    uuid id PK
    OWNED ownership
    text kind "emergency|house|vehicle|education|travel|retirement|custom"
    text name
    numeric target_amount
    date deadline
    numeric planned_monthly
    uuid linked_account_id FK
  }
  goal_contributions {
    uuid id PK
    uuid goal_id FK
    date contributed_on
    numeric amount
    uuid transaction_id FK
  }
```

## 5. Reminders, files, integrations and jobs

```mermaid
erDiagram
  users ||--o{ reminders : owns
  reminders ||--o{ notifications : sends
  users ||--o{ attachments : owns
  users ||--o{ exports : requests
  integrations ||--o{ integration_sync_runs : logs

  reminders {
    uuid id PK
    uuid user_id FK
    text entity_type "loan_installment|card_statement|sip_plan|deposit|chitty_entry|recurring_rule|custom"
    uuid entity_id
    text title
    timestamptz due_at
    jsonb recurrence
    text_arr channels "in_app|push|email"
    text status "active|snoozed|done|cancelled"
    timestamptz snoozed_until
  }
  notifications {
    uuid id PK
    uuid user_id FK
    uuid reminder_id FK
    text channel
    timestamptz scheduled_for
    timestamptz sent_at
    timestamptz read_at
    text status "pending|sent|failed|suppressed_quiet_hours"
  }
  attachments {
    uuid id PK
    uuid owner_id FK
    text entity_type
    uuid entity_id
    text storage_key "private bucket key"
    text content_type
    bigint size_bytes
    text sha256 "hex"
  }
  exports {
    uuid id PK
    uuid user_id FK
    text report_type
    jsonb filters
    text format "pdf|xlsx|csv"
    text status "queued|ready|failed|expired"
    text storage_key
    timestamptz expires_at
  }
  integrations {
    uuid id PK
    text scope_type "user|family"
    uuid scope_id
    text provider "firebase"
    bool enabled
    text consent_version
    uuid consented_by FK
    text_arr data_categories
    timestamptz last_sync_at
    text last_error
    int conflict_count
    timestamptz disconnected_at
  }
  integration_sync_runs {
    uuid id PK
    uuid integration_id FK
    timestamptz started_at
    timestamptz finished_at
    text status
    int records_synced
  }
  jobs {
    uuid id PK
    text kind
    jsonb payload
    text dedupe_key UK
    timestamptz run_at
    int attempts
    int max_attempts
    timestamptz locked_at
    text locked_by
    text status "queued|running|done|failed"
    text last_error
  }
```

## Not stored on the server

- **Message-assistant drafts and processing history:** kept in on-device storage only. Raw message text is discarded after parsing. Only confirmed, normalized transaction fields are sent (plus a one-way fingerprint for duplicate detection, added in M5).
- **Idempotency keys:** a `idempotency_keys(user_id, key, request_hash, response, expires_at)` table with a 24 h TTL. It's operational, so it's omitted from the diagrams above.

## Key indexes (planned)

- `transactions (owner_id, value_date desc, seq desc) where deleted_at is null`; `(account_id, value_date)`; `(counter_account_id)`; `(category_id)`, `(income_source_id)`, `(import_batch_id)` (built in M2). `(family_id, visibility, value_date desc)` arrives with family sharing.
- `sharing_grants (grantee_id, record_type, record_id) where revoked_at is null`.
- `family_members (user_id) where status = 'active'`.
- `user_sessions (token_hash)` unique; `email_tokens (token_hash)` unique.
- Installment tables: `(parent_id, due_date)`; reminders `(user_id, due_at) where status = 'active'`.
- `jobs (status, run_at)`; unique `dedupe_key`.
- `audit_events (actor_user_id, created_at desc)`; `(entity_type, entity_id, created_at desc)`.

## Retention and deletion

- **Account deletion:** the user's sessions are revoked immediately. After a 7-day undo window, the user's owned financial records and attachments are hard-deleted. Records already shared with others are deleted too, and recipients are told. Audit events are kept with the actor id pseudonymised (needed for security investigation). Get legal review of this retention before production.
- **Exports:** files expire after 24 h and are then deleted from storage.
- **Soft-deleted transactions:** purged after 90 days.
