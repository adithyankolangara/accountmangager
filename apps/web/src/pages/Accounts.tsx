import { Link } from 'react-router';
import {
  ACCOUNT_KIND_LABELS,
  CASH_ACCOUNT_KINDS,
  formatFinancialDate,
  formatMoney,
  maskReference,
  sumMoney,
  toMoneyString,
  type Account,
} from '@smartfin/shared';
import { useAccounts } from '../api/queries';
import {
  Amount,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
} from '../ui/components';
import './pages.css';

/** Bank accounts (/accounts) or cash and wallets (/cash): same records, filtered by kind. */
export function Accounts({ mode }: { mode: 'bank' | 'cash' }) {
  const accounts = useAccounts();
  const isCash = (a: Account) => CASH_ACCOUNT_KINDS.includes(a.kind);
  const inView = (accounts.data ?? []).filter((a) => (mode === 'cash' ? isCash(a) : !isCash(a)));
  const active = inView.filter((a) => a.status === 'active');
  const closed = inView.filter((a) => a.status === 'closed');
  const title = mode === 'cash' ? 'Cash & wallets' : 'Accounts';
  const addLink = mode === 'cash' ? '/accounts/new?kind=cash' : '/accounts/new';

  return (
    <div className="page">
      <PageHeader
        title={title}
        description={
          mode === 'cash'
            ? 'Money in hand and in wallets. Balances come from what you record.'
            : 'Savings, salary, current and joint accounts. SmartFin never connects to your bank.'
        }
        actions={
          <Link to={addLink} className="btn btn-primary">
            {mode === 'cash' ? 'Add cash or wallet' : 'Add account'}
          </Link>
        }
      />
      {accounts.isPending ? (
        <LoadingRows />
      ) : accounts.isError ? (
        <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />
      ) : inView.length === 0 ? (
        <Card>
          <EmptyState
            title={mode === 'cash' ? 'No cash or wallets yet' : 'No accounts yet'}
            actions={
              <Link to={addLink} className="btn btn-primary">
                {mode === 'cash' ? 'Add cash or wallet' : 'Add account'}
              </Link>
            }
          >
            {mode === 'cash'
              ? 'Track the cash in your purse or a UPI wallet alongside your bank accounts.'
              : 'Add each bank account you want to track. You only need a name and an opening balance.'}
          </EmptyState>
        </Card>
      ) : (
        <>
          <p>
            <span className="muted">
              Total across active {mode === 'cash' ? 'cash & wallets' : 'accounts'}:{' '}
            </span>
            <strong className="num">
              {formatMoney(toMoneyString(sumMoney(active.map((a) => a.balance))))}
            </strong>
          </p>
          <div className="account-grid">
            {active.map((a) => (
              <AccountCard key={a.id} account={a} />
            ))}
          </div>
          {closed.length > 0 ? (
            <details>
              <summary>Closed ({closed.length})</summary>
              <div className="account-grid" style={{ marginTop: 'var(--space-3)' }}>
                {closed.map((a) => (
                  <AccountCard key={a.id} account={a} />
                ))}
              </div>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}

function AccountCard({ account }: { account: Account }) {
  const identity = [
    account.institution,
    account.maskedReference ? maskReference(account.maskedReference) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Link to={`/accounts/${account.id}`} className="account-card">
      <span className="account-card-top">
        <span>
          <span className="account-name">{account.nickname}</span>
          <span className="account-meta" style={{ display: 'block' }}>
            {ACCOUNT_KIND_LABELS[account.kind]}
            {identity ? ` · ${identity}` : ''}
          </span>
        </span>
        {account.status === 'closed' ? (
          <Badge>Closed</Badge>
        ) : account.isDemo ? (
          <Badge>Demo</Badge>
        ) : null}
      </span>
      <Amount value={account.balance} className="account-balance" />
      <span className="account-meta">
        Calculated from transactions
        {account.lastTransactionDate
          ? ` · last activity ${formatFinancialDate(account.lastTransactionDate)}`
          : ''}
      </span>
    </Link>
  );
}
