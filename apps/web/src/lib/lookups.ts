import { useMemo } from 'react';
import type { Account, Category } from '@smartfin/shared';
import { useAccounts, useCategories } from '../api/queries';

/** Accounts and categories by id, for naming the ids inside transactions. */
export function useLookups() {
  const accounts = useAccounts();
  const categories = useCategories();
  return useMemo(
    () => ({
      accounts: new Map<string, Account>((accounts.data ?? []).map((a) => [a.id, a])),
      categories: new Map<string, Category>((categories.data ?? []).map((c) => [c.id, c])),
      accountList: accounts.data ?? [],
      categoryList: categories.data ?? [],
      isPending: accounts.isPending || categories.isPending,
    }),
    [accounts.data, categories.data, accounts.isPending, categories.isPending],
  );
}

export type Lookups = ReturnType<typeof useLookups>;

/** Persisted per browser: the last account used, to pre-select it on the next entry. */
const LAST_ACCOUNT_KEY = 'smartfin.lastAccount';
export function rememberAccount(id: string) {
  try {
    localStorage.setItem(LAST_ACCOUNT_KEY, id);
  } catch {
    // Storage unavailable: nothing to remember.
  }
}
export function lastAccount(): string | null {
  try {
    return localStorage.getItem(LAST_ACCOUNT_KEY);
  } catch {
    return null;
  }
}
