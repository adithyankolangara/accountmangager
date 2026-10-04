import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  account,
  auditEntry,
  category,
  demoStatus,
  incomeSource,
  sessionResponse,
  summary,
  transaction,
  transactionList,
  type SessionResponse,
  type TransactionListQuery,
} from '@smartfin/shared';
import { z } from 'zod';
import { api, ApiRequestError, apiGet, setCsrfToken } from './client';

/** Transaction list filters as the client sends them (limit is a plain number here). */
export type TransactionFilters = Omit<TransactionListQuery, 'limit'> & { limit?: number };

export const keys = {
  session: ['session'] as const,
  accounts: ['accounts'] as const,
  categories: ['categories'] as const,
  transactions: (filters: TransactionFilters) => ['transactions', filters] as const,
  transaction: (id: string) => ['transaction', id] as const,
  history: (id: string) => ['transaction', id, 'history'] as const,
  income: (month: string) => ['income', month] as const,
  summary: (from: string, to: string) => ['summary', from, to] as const,
  demo: ['demo'] as const,
};

/** The signed-in session, or null when signed out. */
export function useSession() {
  return useQuery({
    queryKey: keys.session,
    queryFn: async ({ signal }): Promise<SessionResponse | null> => {
      try {
        const session = await apiGet('/auth/session', sessionResponse, { signal });
        setCsrfToken(session.csrfToken);
        return session;
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 401) {
          setCsrfToken(null);
          return null;
        }
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Stores a session returned by sign-in or sign-up. */
export function storeSession(queryClient: QueryClient, session: SessionResponse | null) {
  setCsrfToken(session?.csrfToken ?? null);
  queryClient.setQueryData(keys.session, session);
}

export function useAccounts() {
  return useQuery({
    queryKey: keys.accounts,
    queryFn: ({ signal }) => apiGet('/accounts', z.array(account), { signal }),
  });
}

/** All categories, including archived ones (needed to name old transactions). */
export function useCategories() {
  return useQuery({
    queryKey: keys.categories,
    queryFn: ({ signal }) =>
      apiGet('/categories', z.array(category), { signal, query: { includeArchived: true } }),
    staleTime: 10 * 60_000,
  });
}

export function useTransactions(filters: TransactionFilters) {
  return useInfiniteQuery({
    queryKey: keys.transactions(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      apiGet('/transactions', transactionList, {
        signal,
        query: { ...filters, cursor: pageParam },
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: keys.transaction(id ?? ''),
    queryFn: ({ signal }) => apiGet(`/transactions/${id}`, transaction, { signal }),
    enabled: Boolean(id),
  });
}

export function useTransactionHistory(id: string) {
  return useQuery({
    queryKey: keys.history(id),
    queryFn: ({ signal }) => apiGet(`/transactions/${id}/history`, z.array(auditEntry), { signal }),
  });
}

export function useIncomeSources(month: string) {
  return useQuery({
    queryKey: keys.income(month),
    queryFn: ({ signal }) =>
      apiGet('/income-sources', z.array(incomeSource), { signal, query: { month } }),
  });
}

export function useSummary(from: string, to: string) {
  return useQuery({
    queryKey: keys.summary(from, to),
    queryFn: ({ signal }) => apiGet('/reports/summary', summary, { signal, query: { from, to } }),
    placeholderData: (previous) => previous,
  });
}

export function useDemoStatus() {
  return useQuery({
    queryKey: keys.demo,
    queryFn: ({ signal }) => apiGet('/demo', demoStatus, { signal }),
  });
}

/** After any change to money data, everything derived from it is refetched. */
export function invalidateMoney(queryClient: QueryClient) {
  for (const key of ['accounts', 'transactions', 'transaction', 'income', 'summary', 'demo']) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/** A mutation that refreshes money data when it succeeds. */
export function useMoneyMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidateMoney(queryClient) });
}

export { api };
