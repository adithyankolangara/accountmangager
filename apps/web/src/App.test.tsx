import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { account, mockApi, renderApp, session, signedInRoutes } from './test/helpers';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authentication', () => {
  it('sends signed-out visitors to sign in, keeping where they were going', async () => {
    mockApi({
      'GET /auth/session': () => ({
        status: 401,
        body: { error: { code: 'unauthenticated', message: 'Sign in' } },
      }),
    });
    renderApp('/reports');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('validates the sign-in form before calling the API', async () => {
    const calls = mockApi({
      'GET /auth/session': () => ({
        status: 401,
        body: { error: { code: 'unauthenticated', message: 'x' } },
      }),
    });
    renderApp('/signin');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/auth/signin')).toBe(false);
  });

  it('signs in and lands on the dashboard', async () => {
    let signedIn = false;
    mockApi({
      ...signedInRoutes(),
      'GET /auth/session': () =>
        signedIn
          ? { body: session }
          : { status: 401, body: { error: { code: 'unauthenticated', message: 'x' } } },
      'POST /auth/signin': (req) => {
        expect(req.body).toEqual({ email: 'asha@example.com', password: 'correct horse' });
        signedIn = true;
        return { body: session };
      },
    });
    renderApp('/signin');
    await userEvent.type(await screen.findByLabelText('Email'), 'Asha@Example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Hello, Asha' })).toBeInTheDocument();
  });

  it('shows the API message when sign-in fails', async () => {
    mockApi({
      'GET /auth/session': () => ({
        status: 401,
        body: { error: { code: 'unauthenticated', message: 'x' } },
      }),
      'POST /auth/signin': () => ({
        status: 401,
        body: { error: { code: 'unauthenticated', message: 'Email or password is incorrect' } },
      }),
    });
    renderApp('/signin');
    await userEvent.type(await screen.findByLabelText('Email'), 'asha@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect');
  });
});

describe('dashboard', () => {
  it('welcomes a new user with account and demo-data options', async () => {
    mockApi(signedInRoutes([]));
    renderApp('/');
    expect(
      await screen.findByRole('heading', { name: "Let's set up your money" }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add your first account' })).toHaveAttribute(
      'href',
      '/accounts/new',
    );
    expect(screen.getByRole('button', { name: 'Explore with demo data' })).toBeInTheDocument();
  });

  it('shows liquid funds, monthly totals and spending by category', async () => {
    mockApi(
      signedInRoutes([
        account(),
        account({
          id: '00000000-0000-4000-8000-0000000000a2',
          nickname: 'Cash',
          kind: 'cash',
          balance: '543.22',
        }),
      ]),
    );
    renderApp('/');
    const tiles = await screen.findByRole('region', { name: 'This month' });
    expect(within(tiles).getByText('₹1,24,000.00')).toBeInTheDocument();
    expect(await within(tiles).findByText('₹85,000.00')).toBeInTheDocument();
    expect(within(tiles).getByText('76.5%')).toBeInTheDocument();
    expect(
      await screen.findByLabelText('Groceries: ₹20,000.00, 100% of spending, 4 transactions'),
    ).toBeInTheDocument();
  });
});

describe('navigation', () => {
  it('links available screens and marks the rest as not yet available', async () => {
    mockApi(signedInRoutes([account()]));
    renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'Transactions' })).toHaveAttribute(
      'href',
      '/transactions',
    );
    expect(within(nav).queryByRole('link', { name: /Loans/ })).not.toBeInTheDocument();
    const loans = within(nav).getByText('Loans & EMIs');
    expect(loans).toHaveAttribute('aria-disabled', 'true');
    expect(loans).toHaveTextContent('not yet available (arrives in M3)');
  });

  it('renders a not-found page for unknown routes', async () => {
    mockApi(signedInRoutes([account()]));
    renderApp('/does-not-exist');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});

describe('adding a transaction', () => {
  it('validates, then posts the payload with the CSRF token', async () => {
    const calls = mockApi({
      ...signedInRoutes([account()]),
      'POST /transactions': (req) => ({
        status: 201,
        body: {
          transaction: {
            ...(req.body as object),
            id: '00000000-0000-4000-8000-0000000000f1',
            currency: 'INR',
            occurredAt: null,
            direction: null,
            source: 'manual',
            status: 'cleared',
            importBatchId: null,
            version: 1,
            createdAt: '2026-10-04T00:00:00.000Z',
            updatedAt: '2026-10-04T00:00:00.000Z',
            deletedAt: null,
          },
          possibleDuplicates: [],
        },
      }),
    });
    renderApp('/transactions/new');
    await userEvent.click(await screen.findByRole('button', { name: 'Save transaction' }));
    expect(
      await screen.findByText('Enter an amount with at most 2 decimal places'),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Amount (₹)'), '1,250.50');
    expect(screen.getByText('₹1,250.50')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Description/), 'Weekly groceries');
    await userEvent.click(screen.getByRole('button', { name: 'Save transaction' }));

    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST' && c.path === '/transactions')).toBe(true),
    );
    const post = calls.find((c) => c.method === 'POST' && c.path === '/transactions')!;
    expect(post.headers['X-SmartFin-CSRF']).toBe('csrf-test-token');
    expect(post.body).toMatchObject({
      type: 'expense',
      amount: '1250.50',
      accountId: account().id,
      description: 'Weekly groceries',
      counterAccountId: null,
    });
    expect(await screen.findByText('Transaction saved')).toBeInTheDocument();
  });

  it('requires a destination account for transfers', async () => {
    mockApi(
      signedInRoutes([
        account(),
        account({ id: '00000000-0000-4000-8000-0000000000a2', nickname: 'Cash' }),
      ]),
    );
    renderApp('/transactions/new');
    await userEvent.click(await screen.findByLabelText('Transfer'));
    await userEvent.type(screen.getByLabelText('Amount (₹)'), '500');
    await userEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
    expect(await screen.findByText('Choose where the money went')).toBeInTheDocument();
  });
});

describe('settings', () => {
  it('shows the system status', async () => {
    mockApi({
      ...signedInRoutes([account()]),
      'GET /demo': () => ({ body: { loaded: false, accounts: 0, transactions: 0 } }),
      'GET /health': () => ({
        body: {
          status: 'ok',
          version: '0.2.0+abc1234',
          uptimeSeconds: 5,
          time: '2026-10-04T10:00:00.000Z',
        },
      }),
      'GET /health/ready': () => ({
        body: { status: 'ready', checks: { database: 'ok', migrations: 'ok' } },
      }),
    });
    renderApp('/settings');
    expect(await screen.findByText('Operational')).toBeInTheDocument();
    expect(screen.getByText('0.2.0+abc1234')).toBeInTheDocument();
  });
});
