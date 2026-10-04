CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"family_id" uuid,
	"visibility" text DEFAULT 'private' NOT NULL,
	"family_access" text DEFAULT 'view' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"kind" text NOT NULL,
	"nickname" text NOT NULL,
	"institution" text,
	"masked_reference" varchar(4),
	"ifsc" varchar(11),
	"branch" text,
	"opening_balance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"opening_date" date NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "accounts_kind_check" CHECK ("accounts"."kind" in ('savings', 'salary', 'current', 'joint', 'cash', 'wallet')),
	CONSTRAINT "accounts_status_check" CHECK ("accounts"."status" in ('active', 'closed')),
	CONSTRAINT "accounts_masked_reference_check" CHECK ("accounts"."masked_reference" ~ '^[0-9A-Za-z]{4}$'),
	CONSTRAINT "accounts_visibility_check" CHECK ("accounts"."visibility" in ('private', 'selected', 'family')),
	CONSTRAINT "accounts_family_access_check" CHECK ("accounts"."family_access" in ('view', 'edit'))
);
--> statement-breakpoint
CREATE TABLE "balance_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"balance" numeric(18, 2) NOT NULL,
	"observed_on" date NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "balance_observations_source_check" CHECK ("balance_observations"."source" in ('manual', 'import', 'message_draft'))
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_kind_check" CHECK ("categories"."kind" in ('expense', 'income'))
);
--> statement-breakpoint
CREATE TABLE "income_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"family_id" uuid,
	"visibility" text DEFAULT 'private' NOT NULL,
	"family_access" text DEFAULT 'view' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"expected_amount" numeric(18, 2),
	"frequency" text NOT NULL,
	"start_date" date NOT NULL,
	"expected_day" smallint,
	"receiving_account_id" uuid,
	"tax_notes" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "income_sources_kind_check" CHECK ("income_sources"."kind" in ('salary', 'business', 'freelance', 'rent', 'interest', 'dividend', 'bonus', 'pension', 'other')),
	CONSTRAINT "income_sources_frequency_check" CHECK ("income_sources"."frequency" in ('monthly', 'quarterly', 'yearly', 'irregular')),
	CONSTRAINT "income_sources_expected_day_check" CHECK ("income_sources"."expected_day" between 1 and 31),
	CONSTRAINT "income_sources_expected_amount_check" CHECK ("income_sources"."expected_amount" > 0),
	CONSTRAINT "income_sources_visibility_check" CHECK ("income_sources"."visibility" in ('private', 'selected', 'family')),
	CONSTRAINT "income_sources_family_access_check" CHECK ("income_sources"."family_access" in ('view', 'edit'))
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"rows_total" integer NOT NULL,
	"rows_imported" integer NOT NULL,
	"rows_skipped" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "transactions_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"owner_id" uuid NOT NULL,
	"family_id" uuid,
	"visibility" text DEFAULT 'private' NOT NULL,
	"family_access" text DEFAULT 'view' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"value_date" date NOT NULL,
	"occurred_at" timestamp with time zone,
	"account_id" uuid NOT NULL,
	"counter_account_id" uuid,
	"direction" text,
	"category_id" uuid,
	"income_source_id" uuid,
	"description" text,
	"merchant" text,
	"payment_method" text,
	"reference" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'cleared' NOT NULL,
	"import_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "transactions_amount_positive" CHECK ("transactions"."amount" > 0),
	CONSTRAINT "transactions_transfer_shape" CHECK (("transactions"."type" = 'transfer') = ("transactions"."counter_account_id" is not null) and "transactions"."counter_account_id" is distinct from "transactions"."account_id"),
	CONSTRAINT "transactions_adjustment_shape" CHECK (("transactions"."type" = 'adjustment') = ("transactions"."direction" is not null)),
	CONSTRAINT "transactions_type_check" CHECK ("transactions"."type" in ('income', 'expense', 'transfer', 'refund', 'adjustment', 'liability_payment')),
	CONSTRAINT "transactions_source_check" CHECK ("transactions"."source" in ('manual', 'import', 'demo', 'message_draft', 'recurring', 'system')),
	CONSTRAINT "transactions_status_check" CHECK ("transactions"."status" in ('pending', 'cleared', 'reconciled')),
	CONSTRAINT "transactions_payment_method_check" CHECK ("transactions"."payment_method" in ('upi', 'debit_card', 'credit_card', 'netbanking', 'cash', 'cheque', 'auto_debit', 'other')),
	CONSTRAINT "transactions_direction_check" CHECK ("transactions"."direction" in ('in', 'out')),
	CONSTRAINT "transactions_visibility_check" CHECK ("transactions"."visibility" in ('private', 'selected', 'family')),
	CONSTRAINT "transactions_family_access_check" CHECK ("transactions"."family_access" in ('view', 'edit'))
);
--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_observations" ADD CONSTRAINT "balance_observations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_observations" ADD CONSTRAINT "balance_observations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_sources" ADD CONSTRAINT "income_sources_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_sources" ADD CONSTRAINT "income_sources_receiving_account_id_accounts_id_fk" FOREIGN KEY ("receiving_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_counter_account_id_accounts_id_fk" FOREIGN KEY ("counter_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_income_source_id_income_sources_id_fk" FOREIGN KEY ("income_source_id") REFERENCES "public"."income_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consents_user_idx" ON "consents" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "accounts_owner_idx" ON "accounts" USING btree ("owner_id") WHERE "accounts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "balance_observations_account_idx" ON "balance_observations" USING btree ("account_id","observed_on" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "categories_owner_kind_name_uq" ON "categories" USING btree (coalesce("owner_id", '00000000-0000-0000-0000-000000000000'::uuid),"kind",lower("name"));--> statement-breakpoint
CREATE INDEX "income_sources_owner_idx" ON "income_sources" USING btree ("owner_id") WHERE "income_sources"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "import_batches_owner_key_uq" ON "import_batches" USING btree ("owner_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "transactions_owner_date_idx" ON "transactions" USING btree ("owner_id","value_date" DESC NULLS LAST,"seq" DESC NULLS LAST) WHERE "transactions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "transactions_account_date_idx" ON "transactions" USING btree ("account_id","value_date");--> statement-breakpoint
CREATE INDEX "transactions_counter_account_idx" ON "transactions" USING btree ("counter_account_id") WHERE "transactions"."counter_account_id" is not null;--> statement-breakpoint
CREATE INDEX "transactions_category_idx" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "transactions_income_source_idx" ON "transactions" USING btree ("income_source_id");--> statement-breakpoint
CREATE INDEX "transactions_import_batch_idx" ON "transactions" USING btree ("import_batch_id");--> statement-breakpoint
ALTER TABLE "user_sessions" DROP COLUMN "csrf_token_hash";