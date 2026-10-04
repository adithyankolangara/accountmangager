import { useState } from 'react';
import {
  addMonths,
  formatMoney,
  formatMonth,
  Money,
  monthRange,
  PAYMENT_METHOD_LABELS,
  type Summary,
} from '@smartfin/shared';
import { useSummary } from '../api/queries';
import { useToday } from '../auth/session';
import { CategoryBars } from '../components/CategoryBars';
import { useLookups, type Lookups } from '../lib/lookups';
import { Button, Card, ErrorState, LoadingRows, PageHeader, Stat } from '../ui/components';
import './pages.css';

export function Reports() {
  const today = useToday();
  const lookups = useLookups();
  const [month, setMonth] = useState(today.slice(0, 7));
  const { from, to } = monthRange(month);
  const summary = useSummary(from, to);
  const s = summary.data;

  return (
    <div className="page">
      <PageHeader
        title="Monthly report"
        description="Income and spending from your recorded transactions. Exports (PDF, Excel, CSV) arrive in a later release."
      />
      <div className="month-switcher" role="group" aria-label="Month">
        <Button aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
          ←
        </Button>
        <strong aria-live="polite">{formatMonth(month)}</strong>
        <Button aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
          →
        </Button>
      </div>

      {summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : !s ? (
        <LoadingRows rows={5} />
      ) : (
        <div className="page" style={{ opacity: summary.isFetching ? 0.6 : 1 }}>
          <section className="stat-grid" aria-label="Totals">
            <Stat label="Income" value={formatMoney(s.income)} note="Recorded income" />
            <Stat
              label="Spending"
              value={formatMoney(s.spending)}
              note={`Expenses ${formatMoney(s.expense)} − refunds ${formatMoney(s.refunds)}`}
            />
            <Stat label="Saved" value={formatMoney(s.savings)} note="Income − spending" />
            <Stat
              label="Savings rate"
              value={s.savingsRate === null ? '—' : `${s.savingsRate}%`}
              note={s.savingsRate === null ? 'No income this month' : 'Saved ÷ income'}
            />
          </section>

          <div className="two-col">
            <CategoryTable
              title="Spending by category"
              summary={s}
              kind="expense"
              lookups={lookups}
            />
            <CategoryTable title="Income by category" summary={s} kind="income" lookups={lookups} />
          </div>

          <div className="two-col">
            <Card title="Spending by payment method">
              {s.byPaymentMethod.length === 0 ? (
                <p className="muted">No spending this month.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Method</th>
                        <th scope="col" className="num">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.byPaymentMethod.map((m) => (
                        <tr key={m.paymentMethod ?? 'none'}>
                          <td>
                            {m.paymentMethod
                              ? PAYMENT_METHOD_LABELS[m.paymentMethod]
                              : 'Not specified'}
                          </td>
                          <td className="num">{formatMoney(m.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            <Card title="By account">
              {s.byAccount.length === 0 ? (
                <p className="muted">No income or spending this month.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Account</th>
                        <th scope="col" className="num">
                          Income
                        </th>
                        <th scope="col" className="num">
                          Spending
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.byAccount.map((a) => (
                        <tr key={a.accountId}>
                          <td>{lookups.accounts.get(a.accountId)?.nickname ?? 'Account'}</td>
                          <td className="num">{formatMoney(a.income)}</td>
                          <td className="num">{formatMoney(a.spending)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <Card title="How these numbers are calculated">
            <ul className="history-list">
              <li>
                All figures are actual recorded transactions dated within {formatMonth(month)}.
              </li>
              <li>
                Transfers between your own accounts and balance adjustments are excluded, so nothing
                is counted twice.
              </li>
              <li>Refunds reduce spending in their category.</li>
              <li>
                The savings rate is shown as “—” when there is no income, rather than a misleading
                number.
              </li>
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

function CategoryTable({
  title,
  summary,
  kind,
  lookups,
}: {
  title: string;
  summary: Summary;
  kind: 'income' | 'expense';
  lookups: Lookups;
}) {
  const rows = summary.byCategory.filter((c) => c.kind === kind && new Money(c.total).gt(0));
  const total = rows.reduce((sum, r) => sum.plus(r.total), new Money(0));
  const name = (id: string | null) =>
    id ? (lookups.categories.get(id)?.name ?? 'Category') : 'Uncategorised';

  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="muted">Nothing recorded this month.</p>
      ) : (
        <>
          {kind === 'expense' ? (
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <CategoryBars
                data={rows.map((r) => ({
                  key: r.categoryId ?? 'none',
                  label: name(r.categoryId),
                  value: r.total,
                  count: r.count,
                }))}
              />
            </div>
          ) : null}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col" className="num">
                    Amount
                  </th>
                  <th scope="col" className="num">
                    Share
                  </th>
                  <th scope="col" className="num">
                    Count
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.categoryId ?? 'none'}>
                    <td>{name(r.categoryId)}</td>
                    <td className="num">{formatMoney(r.total)}</td>
                    <td className="num">
                      {total.gt(0)
                        ? `${new Money(r.total).div(total).times(100).toFixed(1)}%`
                        : '—'}
                    </td>
                    <td className="num">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
