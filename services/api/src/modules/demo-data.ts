import { addDays, type AccountKind, type PaymentMethod } from '@smartfin/shared';

/**
 * Synthetic, India-flavoured demo data: about three months of salary, rent, bills, groceries,
 * UPI spends, cash and transfers. Institutions and merchants are fictional ("(demo)").
 * Deterministic for a given seed and end date, so tests can rely on it.
 */

export type DemoAccountKey = 'salary' | 'savings' | 'cash' | 'wallet';

export interface DemoAccount {
  key: DemoAccountKey;
  nickname: string;
  kind: AccountKind;
  institution: string | null;
  maskedReference: string | null;
  openingBalance: string;
}

export interface DemoTransaction {
  type: 'income' | 'expense' | 'transfer' | 'refund';
  account: DemoAccountKey;
  counterAccount?: DemoAccountKey;
  amount: string;
  valueDate: string;
  category?: string;
  description: string;
  merchant?: string;
  paymentMethod?: PaymentMethod;
  salary?: true;
}

export interface DemoData {
  startDate: string;
  accounts: DemoAccount[];
  salary: { name: string; expectedAmount: string; expectedDay: number };
  transactions: DemoTransaction[];
}

export const DEMO_DAYS = 90;

/** mulberry32: tiny seeded PRNG, good enough for synthetic data. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function buildDemoData(endDate: string, seed: number): DemoData {
  const random = prng(seed);
  const chance = (p: number) => random() < p;
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
  /** Random amount in rupees, optionally with paise. */
  const amount = (min: number, max: number, paise = false) => {
    const value = min + random() * (max - min);
    return paise ? value.toFixed(2) : `${Math.round(value)}.00`;
  };

  const startDate = addDays(endDate, -(DEMO_DAYS - 1));
  const tx: DemoTransaction[] = [];
  let refundDone = false;
  let interestDone = false;

  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    const dom = Number(date.slice(8, 10));
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();

    if (dom === 1) {
      tx.push({
        type: 'income',
        account: 'salary',
        amount: '85000.00',
        valueDate: date,
        category: 'Salary',
        description: 'Salary credit – Demo Employer Pvt Ltd',
        paymentMethod: 'netbanking',
        salary: true,
      });
    }
    if (dom === 1 || dom === 16) {
      tx.push({
        type: 'transfer',
        account: 'salary',
        counterAccount: 'cash',
        amount: '5000.00',
        valueDate: date,
        description: 'ATM cash withdrawal',
        paymentMethod: 'debit_card',
      });
    }
    if (dom === 2) {
      tx.push({
        type: 'transfer',
        account: 'salary',
        counterAccount: 'savings',
        amount: '20000.00',
        valueDate: date,
        description: 'Monthly savings transfer',
        paymentMethod: 'netbanking',
      });
    }
    if (dom === 5) {
      tx.push({
        type: 'expense',
        account: 'salary',
        amount: '18000.00',
        valueDate: date,
        category: 'Rent',
        description: 'House rent',
        paymentMethod: 'netbanking',
      });
    }
    if (dom === 7) {
      tx.push({
        type: 'expense',
        account: 'salary',
        amount: amount(1100, 1900, true),
        valueDate: date,
        category: 'Utilities',
        description: 'Electricity bill',
        merchant: 'State Power Board (demo)',
        paymentMethod: 'upi',
      });
    }
    if (dom === 8) {
      tx.push({
        type: 'transfer',
        account: 'salary',
        counterAccount: 'wallet',
        amount: '1000.00',
        valueDate: date,
        description: 'Wallet top-up',
        paymentMethod: 'upi',
      });
    }
    if (dom === 10) {
      tx.push(
        {
          type: 'expense',
          account: 'salary',
          amount: '399.00',
          valueDate: date,
          category: 'Mobile & internet',
          description: 'Mobile recharge',
          paymentMethod: 'upi',
        },
        {
          type: 'expense',
          account: 'salary',
          amount: '799.00',
          valueDate: date,
          category: 'Mobile & internet',
          description: 'Broadband bill',
          merchant: 'Fibrenet (demo)',
          paymentMethod: 'auto_debit',
        },
      );
    }
    if (dom === 3 || dom === 13 || dom === 23) {
      tx.push({
        type: 'expense',
        account: 'salary',
        amount: amount(1500, 2600),
        valueDate: date,
        category: 'Fuel',
        description: 'Petrol',
        merchant: 'City Fuels (demo)',
        paymentMethod: 'debit_card',
      });
    }
    if (dom === 12) {
      tx.push({
        type: 'expense',
        account: 'salary',
        amount: amount(300, 900),
        valueDate: date,
        category: 'Entertainment',
        description: 'Movie tickets',
        paymentMethod: 'upi',
      });
    }
    if (dom === 18 && chance(0.6)) {
      tx.push({
        type: 'expense',
        account: 'salary',
        amount: amount(200, 1500, true),
        valueDate: date,
        category: 'Health & medical',
        description: 'Pharmacy',
        merchant: 'Wellness Pharmacy (demo)',
        paymentMethod: 'upi',
      });
    }
    if (dom === 20) {
      const value = amount(999, 4999);
      tx.push({
        type: 'expense',
        account: 'salary',
        amount: value,
        valueDate: date,
        category: 'Shopping',
        description: 'Online shopping order',
        merchant: 'ShopKart (demo)',
        paymentMethod: 'upi',
      });
      if (!refundDone && addDays(date, 4) <= endDate) {
        refundDone = true;
        tx.push({
          type: 'refund',
          account: 'salary',
          amount: value,
          valueDate: addDays(date, 4),
          category: 'Shopping',
          description: 'Refund – returned item',
          merchant: 'ShopKart (demo)',
          paymentMethod: 'upi',
        });
      }
    }
    if (dom === 26) {
      tx.push({
        type: 'expense',
        account: 'salary',
        amount: '199.00',
        valueDate: date,
        category: 'Entertainment',
        description: 'Streaming subscription',
        paymentMethod: 'auto_debit',
      });
    }
    if (dom === 28 && !interestDone) {
      interestDone = true;
      tx.push({
        type: 'income',
        account: 'savings',
        amount: '1250.40',
        valueDate: date,
        category: 'Interest',
        description: 'Savings interest credit',
        paymentMethod: 'netbanking',
      });
    }
    if (weekday === 6) {
      tx.push({
        type: 'expense',
        account: 'salary',
        amount: amount(1200, 3500, true),
        valueDate: date,
        category: 'Groceries',
        description: 'Weekly groceries',
        merchant: 'Fresh Mart (demo)',
        paymentMethod: 'upi',
      });
    }
    if (chance(0.45)) {
      tx.push({
        type: 'expense',
        account: 'salary',
        amount: amount(120, 850),
        valueDate: date,
        category: 'Food & dining',
        description: pick(['Lunch', 'Dinner', 'Food delivery', 'Breakfast']),
        merchant: pick(['Udupi Café (demo)', 'Biryani House (demo)', 'Tiffin Centre (demo)']),
        paymentMethod: 'upi',
      });
    }
    if (chance(0.3)) {
      const spend = pick([
        { category: 'Transport', description: 'Auto-rickshaw', min: 40, max: 180 },
        { category: 'Groceries', description: 'Vegetables and fruit', min: 80, max: 350 },
        { category: 'Food & dining', description: 'Tea and snacks', min: 20, max: 90 },
      ]);
      tx.push({
        type: 'expense',
        account: 'cash',
        amount: amount(spend.min, spend.max),
        valueDate: date,
        category: spend.category,
        description: spend.description,
        paymentMethod: 'cash',
      });
    }
    if ((weekday === 1 || weekday === 4) && chance(0.8)) {
      tx.push({
        type: 'expense',
        account: 'wallet',
        amount: amount(30, 120),
        valueDate: date,
        category: 'Transport',
        description: 'Metro ride',
        paymentMethod: 'other',
      });
    }
  }

  return {
    startDate,
    accounts: [
      {
        key: 'salary',
        nickname: 'Salary account',
        kind: 'salary',
        institution: 'Demo National Bank',
        maskedReference: '4821',
        openingBalance: '42000.00',
      },
      {
        key: 'savings',
        nickname: 'Savings',
        kind: 'savings',
        institution: 'Demo Co-operative Bank',
        maskedReference: '7310',
        openingBalance: '150000.00',
      },
      {
        key: 'cash',
        nickname: 'Cash in hand',
        kind: 'cash',
        institution: null,
        maskedReference: null,
        openingBalance: '2500.00',
      },
      {
        key: 'wallet',
        nickname: 'UPI wallet',
        kind: 'wallet',
        institution: 'Demo Pay',
        maskedReference: null,
        openingBalance: '300.00',
      },
    ],
    salary: { name: 'Salary – Demo Employer', expectedAmount: '85000.00', expectedDay: 1 },
    transactions: tx,
  };
}
