import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { App } from '../App';
import { ToastProvider } from '../ui/toast';

export interface MockRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Record<string, string>;
}

type Handler = (req: MockRequest) => { status?: number; body?: unknown } | undefined;

export function json(status: number, body: unknown) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Stubs fetch with handlers keyed by "METHOD /path" (path without the /api/v1 prefix).
 * Unknown routes reject like a network failure. Returns the list of requests made.
 */
export function mockApi(routes: Record<string, Handler>) {
  const calls: MockRequest[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const req: MockRequest = {
        method: init?.method ?? 'GET',
        path: url.pathname.replace(/^\/api\/v1/, ''),
        query: url.searchParams,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        headers: (init?.headers as Record<string, string>) ?? {},
      };
      calls.push(req);
      const handler = routes[`${req.method} ${req.path}`];
      if (!handler) throw new TypeError(`No mock for ${req.method} ${req.path}`);
      const result = handler(req) ?? {};
      return json(result.status ?? 200, result.body ?? {});
    }),
  );
  return calls;
}

export function renderApp(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

export const session = {
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'asha@example.com',
    displayName: 'Asha Menon',
    preferredCurrency: 'INR',
    timeZone: 'Asia/Kolkata',
    createdAt: '2026-10-01T00:00:00.000Z',
  },
  csrfToken: 'csrf-test-token',
};

export function account(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-0000000000a1',
    nickname: 'Salary account',
    kind: 'salary',
    institution: 'Demo Bank',
    maskedReference: '4821',
    ifsc: null,
    branch: null,
    openingBalance: '10000.00',
    openingDate: '2026-01-01',
    currency: 'INR',
    status: 'active',
    notes: null,
    visibility: 'private',
    isDemo: false,
    balance: '123456.78',
    balanceAsOf: '2026-10-04',
    lastTransactionDate: '2026-10-03',
    lastObservation: null,
    version: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

export const categories = [
  {
    id: '00000000-0000-4000-8000-0000000000c1',
    name: 'Groceries',
    kind: 'expense',
    system: true,
    archived: false,
  },
  {
    id: '00000000-0000-4000-8000-0000000000c2',
    name: 'Salary',
    kind: 'income',
    system: true,
    archived: false,
  },
];

export function summary(overrides: Record<string, unknown> = {}) {
  return {
    from: '2026-10-01',
    to: '2026-10-31',
    income: '85000.00',
    expense: '20000.00',
    refunds: '0.00',
    spending: '20000.00',
    savings: '65000.00',
    savingsRate: '76.5',
    byCategory: [{ categoryId: categories[0]!.id, kind: 'expense', total: '20000.00', count: 4 }],
    byPaymentMethod: [],
    byAccount: [],
    ...overrides,
  };
}

/** Routes every signed-in screen needs, with an empty or populated account list. */
export function signedInRoutes(accounts: unknown[] = []): Record<string, Handler> {
  return {
    'GET /auth/session': () => ({ body: session }),
    'GET /accounts': () => ({ body: accounts }),
    'GET /categories': () => ({ body: categories }),
    'GET /reports/summary': () => ({ body: summary() }),
    'GET /transactions': () => ({ body: { items: [], nextCursor: null } }),
    'GET /income-sources': () => ({ body: [] }),
  };
}
