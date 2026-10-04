import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockApi(routes: Record<string, () => Response | Promise<Response>>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://localhost').pathname;
      const handler = routes[path];
      return handler ? Promise.resolve(handler()) : Promise.reject(new TypeError('no route'));
    }),
  );
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const health = {
  status: 'ok',
  version: '0.1.0+abc1234',
  uptimeSeconds: 12,
  time: '2026-10-04T10:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dashboard system status', () => {
  it('shows operational when the API and database are ready', async () => {
    mockApi({
      '/api/v1/health': () => jsonResponse(200, health),
      '/api/v1/health/ready': () =>
        jsonResponse(200, { status: 'ready', checks: { database: 'ok', migrations: 'ok' } }),
    });
    renderAt('/');
    const status = await screen.findByText('Operational');
    expect(status).toBeInTheDocument();
    expect(screen.getByText('0.1.0+abc1234')).toBeInTheDocument();
    expect(screen.getByText('Up to date')).toBeInTheDocument();
  });

  it('shows degraded when migrations are pending (503 readiness)', async () => {
    mockApi({
      '/api/v1/health': () => jsonResponse(200, health),
      '/api/v1/health/ready': () =>
        jsonResponse(503, {
          status: 'not_ready',
          checks: { database: 'ok', migrations: 'pending' },
        }),
    });
    renderAt('/');
    expect(await screen.findByText('Degraded')).toBeInTheDocument();
    expect(screen.getByText(/Pending/)).toBeInTheDocument();
  });

  it('shows unavailable with the request reference when the API errors', async () => {
    mockApi({
      '/api/v1/health': () =>
        jsonResponse(500, {
          error: { code: 'internal_error', message: 'Something went wrong', requestId: 'req-42' },
        }),
      '/api/v1/health/ready': () =>
        jsonResponse(200, { status: 'ready', checks: { database: 'ok', migrations: 'ok' } }),
    });
    renderAt('/');
    expect(await screen.findByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByText(/reference req-42/)).toBeInTheDocument();
  });

  it('shows unavailable when the server cannot be reached', async () => {
    mockApi({});
    renderAt('/');
    expect(await screen.findByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByText(/Could not reach the SmartFin server/)).toBeInTheDocument();
  });
});

describe('navigation', () => {
  it('links available screens and marks the rest as not yet available', async () => {
    mockApi({});
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/');
    expect(within(nav).queryByRole('link', { name: /Transactions/ })).not.toBeInTheDocument();
    const transactions = within(nav).getByText('Transactions');
    expect(transactions).toHaveAttribute('aria-disabled', 'true');
    expect(transactions).toHaveTextContent('not yet available (arrives in M2)');
  });

  it('renders a not-found page for unknown routes', () => {
    mockApi({});
    renderAt('/does-not-exist');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
