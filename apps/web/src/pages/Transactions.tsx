import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  formatFinancialDate,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPES,
  type TransactionType,
} from '@smartfin/shared';
import { useTransactions, type TransactionFilters } from '../api/queries';
import { TransactionItem } from '../components/TransactionItem';
import { useLookups } from '../lib/lookups';
import { groupByDate } from '../lib/transactions';
import { Button, Card, EmptyState, ErrorState, LoadingRows, PageHeader } from '../ui/components';
import { SelectField, TextField } from '../ui/fields';
import './pages.css';

const FILTER_KEYS = [
  'q',
  'type',
  'accountId',
  'categoryId',
  'from',
  'to',
  'importBatchId',
  'deleted',
] as const;

export function Transactions() {
  const [params, setParams] = useSearchParams();
  const lookups = useLookups();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const searchTimer = useRef<number | undefined>(undefined);

  const filters: TransactionFilters = { limit: 50 };
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value) (filters as Record<string, string>)[key] = value;
  }
  const list = useTransactions(filters);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const showingDeleted = filters.deleted === 'only';
  const filtered = FILTER_KEYS.some((k) => k !== 'deleted' && params.get(k));

  function setFilter(key: (typeof FILTER_KEYS)[number], value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  return (
    <div className="page">
      <PageHeader
        title={showingDeleted ? 'Deleted transactions' : 'Transactions'}
        description={
          showingDeleted ? 'Open one to restore it.' : 'Everything you spent, earned and moved.'
        }
        actions={
          <>
            <Link to="/transactions/import" className="btn btn-secondary">
              Import statement
            </Link>
            <Link to="/transactions/new" className="btn btn-primary">
              Add transaction
            </Link>
          </>
        }
      />

      <form className="filter-bar" role="search" onSubmit={(e) => e.preventDefault()}>
        <TextField
          label="Search"
          className="grow"
          type="search"
          placeholder="Description, merchant, note or reference"
          value={search}
          onChange={(e) => {
            const value = e.target.value;
            setSearch(value);
            window.clearTimeout(searchTimer.current);
            searchTimer.current = window.setTimeout(() => setFilter('q', value.trim()), 300);
          }}
        />
        <SelectField
          label="Type"
          value={filters.type ?? ''}
          onChange={(e) => setFilter('type', e.target.value)}
        >
          <option value="">All types</option>
          {TRANSACTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {TRANSACTION_TYPE_LABELS[t as TransactionType]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Account"
          value={filters.accountId ?? ''}
          onChange={(e) => setFilter('accountId', e.target.value)}
        >
          <option value="">All accounts</option>
          {lookups.accountList.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nickname}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Category"
          value={filters.categoryId ?? ''}
          onChange={(e) => setFilter('categoryId', e.target.value)}
        >
          <option value="">All categories</option>
          {lookups.categoryList
            .filter((c) => !c.archived || c.id === filters.categoryId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </SelectField>
        <TextField
          label="From"
          type="date"
          value={filters.from ?? ''}
          onChange={(e) => setFilter('from', e.target.value)}
        />
        <TextField
          label="To"
          type="date"
          value={filters.to ?? ''}
          onChange={(e) => setFilter('to', e.target.value)}
        />
      </form>

      <Card>
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.isPending ? (
          <LoadingRows rows={6} />
        ) : items.length === 0 ? (
          <EmptyState
            title={filtered || showingDeleted ? 'No matching transactions' : 'No transactions yet'}
            actions={
              filtered ? (
                <Button
                  onClick={() => {
                    setSearch('');
                    setParams(new URLSearchParams(), { replace: true });
                  }}
                >
                  Clear filters
                </Button>
              ) : !showingDeleted ? (
                <Link to="/transactions/new" className="btn btn-primary">
                  Add a transaction
                </Link>
              ) : null
            }
          >
            {filtered
              ? 'Try different filters.'
              : showingDeleted
                ? 'Nothing has been deleted.'
                : 'Record your first expense or income, or import a bank statement.'}
          </EmptyState>
        ) : (
          <div style={{ opacity: list.isFetching && !list.isFetchingNextPage ? 0.6 : 1 }}>
            {groupByDate(items).map((group) => (
              <section
                key={group.date}
                className="day-group"
                aria-label={formatFinancialDate(group.date)}
              >
                <h2 className="day-heading">{formatFinancialDate(group.date)}</h2>
                <ul className="tx-list">
                  {group.items.map((tx) => (
                    <TransactionItem
                      key={tx.id}
                      tx={tx}
                      lookups={lookups}
                      perspectiveAccountId={filters.accountId}
                    />
                  ))}
                </ul>
              </section>
            ))}
            {list.hasNextPage ? (
              <div className="load-more">
                <Button
                  onClick={() => void list.fetchNextPage()}
                  disabled={list.isFetchingNextPage}
                >
                  {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </Card>

      <p className="muted">
        {showingDeleted ? (
          <Link to="/transactions">Back to transactions</Link>
        ) : (
          <Link to="/transactions?deleted=only">View deleted transactions</Link>
        )}
      </p>
    </div>
  );
}
