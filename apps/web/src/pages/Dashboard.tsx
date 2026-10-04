import { useQueryClient, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  ACCOUNT_KIND_LABELS,
  demoStatus,
  formatFinancialDate,
  formatMonth,
  formatMoney,
  monthRange,
  sumMoney,
  toMoneyString,
} from '@smartfin/shared';
import { api, describeError } from '../api/client';
import { invalidateMoney, useIncomeSources, useSummary, useTransactions } from '../api/queries';
import { useToday, useUser } from '../auth/session';
import { CategoryBars } from '../components/CategoryBars';
import { IncomeStatus } from '../components/IncomeStatus';
import { TransactionItem } from '../components/TransactionItem';
import { useLookups, type Lookups } from '../lib/lookups';
import { Amount, Button, Card, EmptyState, ErrorState, LoadingRows, Stat } from '../ui/components';
import { useToast } from '../lib/toast';
import './pages.css';

export function Dashboard() {
  const user = useUser();
  const today = useToday();
  const month = today.slice(0, 7);
  const lookups = useLookups();

  if (lookups.isPending) {
    return (
      <div className="page">
        <LoadingRows rows={4} />
      </div>
    );
  }
  const active = lookups.accountList.filter((a) => a.status === 'active');

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1>Hello, {user.displayName.split(' ')[0]}</h1>
          <p className="muted">{formatMonth(month)} at a glance</p>
        </div>
        {active.length > 0 ? (
          <div className="page-actions">
            <Link to="/transactions/new" className="btn btn-primary">
              Add transaction
            </Link>
          </div>
        ) : null}
      </header>
      {active.length === 0 ? <Welcome /> : <Overview month={month} lookups={lookups} />}
    </div>
  );
}

function Welcome() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const loadDemo = useMutation({
    mutationFn: () => api('POST', '/demo', { schema: demoStatus }),
    onSuccess: (status) => {
      invalidateMoney(queryClient);
      toast.show(
        `Demo data loaded: ${status.accounts} accounts, ${status.transactions} transactions.`,
      );
    },
    onError: (error) => toast.show(describeError(error), { tone: 'error' }),
  });

  return (
    <Card>
      <EmptyState
        title="Let's set up your money"
        actions={
          <>
            <Link to="/accounts/new" className="btn btn-primary">
              Add your first account
            </Link>
            <Button onClick={() => loadDemo.mutate()} disabled={loadDemo.isPending}>
              {loadDemo.isPending ? 'Loading demo…' : 'Explore with demo data'}
            </Button>
          </>
        }
      >
        Add a bank account, cash or wallet, then record or import transactions. Or explore with
        three months of realistic sample data; you can remove it any time in Settings.
      </EmptyState>
    </Card>
  );
}

function Overview({ month, lookups }: { month: string; lookups: Lookups }) {
  const { from, to } = monthRange(month);
  const summary = useSummary(from, to);
  const recent = useTransactions({ limit: 6 });
  const income = useIncomeSources(month);
  const active = lookups.accountList.filter((a) => a.status === 'active');
  const liquid = toMoneyString(sumMoney(active.map((a) => a.balance)));
  const s = summary.data;

  const spendingByCategory = (s?.byCategory ?? [])
    .filter((c) => c.kind === 'expense')
    .map((c) => ({
      key: c.categoryId ?? 'none',
      label: c.categoryId
        ? (lookups.categories.get(c.categoryId)?.name ?? 'Category')
        : 'Uncategorised',
      value: c.total,
      count: c.count,
    }));

  return (
    <>
      <section className="stat-grid" aria-label="This month">
        <Stat
          label="Liquid funds"
          value={formatMoney(liquid)}
          note={`Calculated across ${active.length} account${active.length === 1 ? '' : 's'}`}
        />
        <Stat
          label="Income this month"
          value={s ? formatMoney(s.income) : '…'}
          note="Recorded income"
        />
        <Stat
          label="Spending this month"
          value={s ? formatMoney(s.spending) : '…'}
          note="Expenses minus refunds; transfers excluded"
        />
        <Stat
          label="Savings rate"
          value={s ? (s.savingsRate === null ? '—' : `${s.savingsRate}%`) : '…'}
          note={
            s && s.savingsRate === null ? 'No income recorded this month' : 'Of this month’s income'
          }
        />
      </section>

      <div className="two-col">
        <Card
          title="Spending by category"
          subtitle={formatMonth(month)}
          actions={
            <Link to="/reports" className="card-link">
              Full report
            </Link>
          }
        >
          {summary.isError ? (
            <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
          ) : !s ? (
            <LoadingRows />
          ) : spendingByCategory.length === 0 ? (
            <p className="muted">No spending recorded this month yet.</p>
          ) : (
            <CategoryBars data={spendingByCategory} />
          )}
        </Card>

        <Card
          title="Accounts"
          subtitle="Balances calculated from your transactions"
          actions={
            <Link to="/accounts" className="card-link">
              Manage
            </Link>
          }
        >
          <ul className="mini-list">
            {active.map((a) => (
              <li key={a.id}>
                <span>
                  <Link to={`/accounts/${a.id}`}>{a.nickname}</Link>
                  <span className="tx-meta" style={{ display: 'block' }}>
                    {ACCOUNT_KIND_LABELS[a.kind]}
                    {a.lastTransactionDate
                      ? ` · last activity ${formatFinancialDate(a.lastTransactionDate)}`
                      : ''}
                  </span>
                </span>
                <Amount value={a.balance} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="two-col">
        <Card
          title="Recent transactions"
          actions={
            <Link to="/transactions" className="card-link">
              All transactions
            </Link>
          }
        >
          {recent.isError ? (
            <ErrorState error={recent.error} onRetry={() => void recent.refetch()} />
          ) : recent.isPending ? (
            <LoadingRows />
          ) : recent.data.pages[0]!.items.length === 0 ? (
            <p className="muted">
              Nothing yet. <Link to="/transactions/new">Add a transaction</Link> or{' '}
              <Link to="/transactions/import">import a statement</Link>.
            </p>
          ) : (
            <ul className="tx-list">
              {recent.data.pages[0]!.items.map((tx) => (
                <TransactionItem key={tx.id} tx={tx} lookups={lookups} />
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Income this month"
          subtitle="Expected vs received"
          actions={
            <Link to="/income" className="card-link">
              Income sources
            </Link>
          }
        >
          {income.isPending ? (
            <LoadingRows />
          ) : income.isError ? (
            <ErrorState error={income.error} onRetry={() => void income.refetch()} />
          ) : income.data.length === 0 ? (
            <p className="muted">
              Track salary, rent or interest you expect each month.{' '}
              <Link to="/income">Add an income source</Link>
            </p>
          ) : (
            <ul className="mini-list">
              {income.data.map((source) => (
                <li key={source.id}>
                  <span>{source.name}</span>
                  <IncomeStatus period={source.period} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
