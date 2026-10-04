import { TRANSACTION_TYPE_LABELS, type Transaction } from '@smartfin/shared';
import type { Lookups } from './lookups';

/** Direction of a transaction, optionally from one account's point of view. */
export function directionOf(tx: Transaction, perspectiveAccountId?: string): 'in' | 'out' | 'none' {
  switch (tx.type) {
    case 'income':
    case 'refund':
      return 'in';
    case 'expense':
    case 'liability_payment':
      return 'out';
    case 'adjustment':
      return tx.direction === 'in' ? 'in' : 'out';
    case 'transfer':
      if (!perspectiveAccountId) return 'none';
      return tx.counterAccountId === perspectiveAccountId ? 'in' : 'out';
  }
}

export function transactionTitle(tx: Transaction, lookups: Lookups): string {
  return (
    tx.description ||
    tx.merchant ||
    (tx.categoryId ? lookups.categories.get(tx.categoryId)?.name : undefined) ||
    TRANSACTION_TYPE_LABELS[tx.type]
  );
}

/** Groups an already date-sorted list by value date, preserving order. */
export function groupByDate(items: Transaction[]): { date: string; items: Transaction[] }[] {
  const groups: { date: string; items: Transaction[] }[] = [];
  for (const tx of items) {
    const last = groups.at(-1);
    if (last && last.date === tx.valueDate) last.items.push(tx);
    else groups.push({ date: tx.valueDate, items: [tx] });
  }
  return groups;
}
