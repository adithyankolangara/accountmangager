/** Enumerations shared by the database schema, API validation and UI. */

export const ACCOUNT_KINDS = ['savings', 'salary', 'current', 'joint', 'cash', 'wallet'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];
export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  savings: 'Savings',
  salary: 'Salary',
  current: 'Current',
  joint: 'Joint',
  cash: 'Cash in hand',
  wallet: 'Wallet',
};
/** Kinds shown on the Cash & wallets screen rather than Accounts. */
export const CASH_ACCOUNT_KINDS: readonly AccountKind[] = ['cash', 'wallet'];

export const ACCOUNT_STATUSES = ['active', 'closed'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const VISIBILITIES = ['private', 'selected', 'family'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/**
 * Ledger rules (docs/erd.md §2): income and refund add to the account; expense subtracts;
 * transfer moves money to the counter account; adjustment moves it in or out to reconcile.
 * Liability payments (card/loan settlements) arrive with M3.
 */
export const TRANSACTION_TYPES = [
  'income',
  'expense',
  'transfer',
  'refund',
  'adjustment',
  'liability_payment',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
/** Types a user can create in M2. */
export const ENTRY_TRANSACTION_TYPES = ['expense', 'income', 'transfer', 'refund'] as const;
export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
  refund: 'Refund',
  adjustment: 'Balance adjustment',
  liability_payment: 'Card/loan payment',
};

export const ADJUSTMENT_DIRECTIONS = ['in', 'out'] as const;
export type AdjustmentDirection = (typeof ADJUSTMENT_DIRECTIONS)[number];

export const PAYMENT_METHODS = [
  'upi',
  'debit_card',
  'credit_card',
  'netbanking',
  'cash',
  'cheque',
  'auto_debit',
  'other',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  upi: 'UPI',
  debit_card: 'Debit card',
  credit_card: 'Credit card',
  netbanking: 'Net banking',
  cash: 'Cash',
  cheque: 'Cheque',
  auto_debit: 'Auto-debit',
  other: 'Other',
};

/** Where a transaction came from. Shown as a provenance badge. */
export const TRANSACTION_SOURCES = [
  'manual',
  'import',
  'demo',
  'message_draft',
  'recurring',
  'system',
] as const;
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

export const TRANSACTION_STATUSES = ['pending', 'cleared', 'reconciled'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const CATEGORY_KINDS = ['expense', 'income'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const INCOME_KINDS = [
  'salary',
  'business',
  'freelance',
  'rent',
  'interest',
  'dividend',
  'bonus',
  'pension',
  'other',
] as const;
export type IncomeKind = (typeof INCOME_KINDS)[number];
export const INCOME_KIND_LABELS: Record<IncomeKind, string> = {
  salary: 'Salary',
  business: 'Business',
  freelance: 'Freelance',
  rent: 'Rent',
  interest: 'Interest',
  dividend: 'Dividend',
  bonus: 'Bonus',
  pension: 'Pension',
  other: 'Other',
};

export const INCOME_FREQUENCIES = ['monthly', 'quarterly', 'yearly', 'irregular'] as const;
export type IncomeFrequency = (typeof INCOME_FREQUENCIES)[number];
export const INCOME_FREQUENCY_LABELS: Record<IncomeFrequency, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  irregular: 'Irregular (no expected amount)',
};
