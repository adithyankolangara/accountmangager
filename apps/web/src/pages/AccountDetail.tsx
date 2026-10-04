import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { z } from 'zod';
import {
  account as accountSchema,
  ACCOUNT_KIND_LABELS,
  formatFinancialDate,
  formatMoney,
  maskReference,
  reconcileInput,
  transaction,
  type Account,
} from '@smartfin/shared';
import { api, apiGet } from '../api/client';
import { useMoneyMutation, useTransactions } from '../api/queries';
import { useToday } from '../auth/session';
import { TransactionItem } from '../components/TransactionItem';
import {
  apiFieldErrors,
  cleanAmount,
  orNull,
  zodFieldErrors,
  type FieldErrors,
} from '../lib/forms';
import { useLookups } from '../lib/lookups';
import { Amount, Badge, Button, Card, ErrorState, LoadingRows, PageHeader } from '../ui/components';
import { AmountField, CheckboxField, TextField } from '../ui/fields';
import { useToast } from '../lib/toast';
import './pages.css';

const observation = z.object({
  id: z.uuid(),
  balance: z.string(),
  observedOn: z.string(),
  source: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
});

export function AccountDetail() {
  const { id = '' } = useParams();
  const query = useQuery({
    queryKey: ['accounts', id],
    queryFn: ({ signal }) => apiGet(`/accounts/${id}`, accountSchema, { signal }),
  });
  if (query.isPending) return <LoadingRows rows={5} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <AccountView account={query.data} />;
}

function AccountView({ account }: { account: Account }) {
  const lookups = useLookups();
  const recent = useTransactions({ accountId: account.id, limit: 15 });
  const observations = useQuery({
    queryKey: ['accounts', account.id, 'observations'],
    queryFn: ({ signal }) =>
      apiGet(`/accounts/${account.id}/observations`, z.array(observation), { signal }),
  });
  const identity = [
    account.institution,
    account.maskedReference ? maskReference(account.maskedReference) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const items = recent.data?.pages[0]?.items ?? [];

  return (
    <div className="page">
      <PageHeader
        title={account.nickname}
        description={
          <>
            {ACCOUNT_KIND_LABELS[account.kind]}
            {identity ? ` · ${identity}` : ''}{' '}
            {account.status === 'closed' ? <Badge>Closed</Badge> : null}{' '}
            {account.isDemo ? <Badge>Demo</Badge> : null}
          </>
        }
        actions={
          <>
            <Link to={`/accounts/${account.id}/edit`} className="btn btn-secondary">
              Edit
            </Link>
            {account.status === 'active' ? (
              <Link
                to={`/transactions/new?accountId=${account.id}&returnTo=/accounts/${account.id}`}
                className="btn btn-primary"
              >
                Add transaction
              </Link>
            ) : null}
          </>
        }
      />

      <div className="two-col">
        <Card title="Balance" subtitle={`As of ${formatFinancialDate(account.balanceAsOf)}`}>
          <Amount value={account.balance} className="account-balance" />
          <p className="muted" style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
            Calculated: opening balance of {formatMoney(account.openingBalance)} on{' '}
            {formatFinancialDate(account.openingDate)} plus every transaction recorded since.
          </p>
          {account.lastObservation ? (
            <p
              className="muted"
              style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)' }}
            >
              Last checked against your bank: {formatMoney(account.lastObservation.balance)} on{' '}
              {formatFinancialDate(account.lastObservation.observedOn)}.
            </p>
          ) : null}
        </Card>
        {account.status === 'active' ? <Reconcile account={account} /> : null}
      </div>

      <Card
        title="Recent transactions"
        actions={
          <Link to={`/transactions?accountId=${account.id}`} className="card-link">
            View all
          </Link>
        }
      >
        {recent.isPending ? (
          <LoadingRows />
        ) : recent.isError ? (
          <ErrorState error={recent.error} onRetry={() => void recent.refetch()} />
        ) : items.length === 0 ? (
          <p className="muted">No transactions in this account yet.</p>
        ) : (
          <ul className="tx-list">
            {items.map((tx) => (
              <TransactionItem
                key={tx.id}
                tx={tx}
                lookups={lookups}
                perspectiveAccountId={account.id}
              />
            ))}
          </ul>
        )}
      </Card>

      {observations.data && observations.data.length > 0 ? (
        <Card
          title="Balance checks"
          subtitle="Balances you confirmed from a statement, passbook or banking app"
        >
          <ul className="mini-list">
            {observations.data.map((o) => (
              <li key={o.id}>
                <span>
                  {formatFinancialDate(o.observedOn)}
                  {o.note ? <span className="muted"> · {o.note}</span> : null}
                </span>
                <Amount value={o.balance} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

const reconcileResult = z.object({
  account: accountSchema,
  difference: z.string(),
  adjustment: transaction.nullable(),
});

function Reconcile({ account }: { account: Account }) {
  const toast = useToast();
  const today = useToday();
  const [form, setForm] = useState({
    actualBalance: '',
    asOf: today,
    createAdjustment: true,
    note: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const reconcile = useMoneyMutation((body: Record<string, unknown>) =>
    api('POST', `/accounts/${account.id}/reconcile`, { body, schema: reconcileResult }),
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    const payload = {
      actualBalance: cleanAmount(form.actualBalance),
      asOf: form.asOf,
      createAdjustment: form.createAdjustment,
      note: orNull(form.note),
    };
    const parsed = reconcileInput.safeParse(payload);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    reconcile.mutate(payload, {
      onSuccess: (result) => {
        const diff = result.difference;
        toast.show(
          diff === '0.00'
            ? 'Balance matches. Nothing to adjust.'
            : result.adjustment
              ? `Adjusted by ${formatMoney(diff.replace('-', ''))} so the balance matches.`
              : `Recorded. SmartFin's balance differs by ${formatMoney(diff.replace('-', ''))}.`,
        );
        setForm((f) => ({ ...f, actualBalance: '', note: '' }));
      },
      onError: (error) => setErrors(apiFieldErrors(error)),
    });
  }

  return (
    <Card title="Check against your bank" subtitle="Enter the balance your statement or app shows.">
      <form onSubmit={submit} noValidate className="stack">
        {errors.form ? (
          <p className="form-error" role="alert">
            {errors.form}
          </p>
        ) : null}
        <div className="form-grid">
          <AmountField
            label="Actual balance (₹)"
            allowNegative
            value={form.actualBalance}
            onChange={(v) => setForm({ ...form, actualBalance: v })}
            error={errors.actualBalance}
            required
          />
          <TextField
            label="As of"
            type="date"
            value={form.asOf}
            max={today}
            onChange={(e) => setForm({ ...form, asOf: e.target.value })}
            error={errors.asOf}
          />
        </div>
        <CheckboxField
          label="Add an adjustment if it differs"
          hint="Recorded as a balance adjustment; it doesn't count as income or spending."
          checked={form.createAdjustment}
          onChange={(e) => setForm({ ...form, createAdjustment: e.target.checked })}
        />
        <TextField
          label="Note"
          optional
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          maxLength={200}
        />
        <div>
          <Button type="submit" disabled={reconcile.isPending}>
            {reconcile.isPending ? 'Checking…' : 'Check balance'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
