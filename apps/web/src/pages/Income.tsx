import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  addMonths,
  formatMoney,
  formatMonth,
  INCOME_FREQUENCIES,
  INCOME_FREQUENCY_LABELS,
  INCOME_KIND_LABELS,
  INCOME_KINDS,
  incomeSource as incomeSourceSchema,
  incomeSourceInput,
  incomeSourceUpdate,
  Money,
  sumMoney,
  toMoneyString,
  type IncomeFrequency,
  type IncomeKind,
  type IncomeSource,
} from '@smartfin/shared';
import { api } from '../api/client';
import { useIncomeSources, useMoneyMutation } from '../api/queries';
import { useToday } from '../auth/session';
import { IncomeStatus } from '../components/IncomeStatus';
import {
  apiFieldErrors,
  cleanAmount,
  orNull,
  zodFieldErrors,
  type FieldErrors,
} from '../lib/forms';
import { useLookups } from '../lib/lookups';
import {
  Badge,
  Button,
  Card,
  ConfirmButton,
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
  Stat,
} from '../ui/components';
import { Dialog } from '../ui/Dialog';
import { AmountField, SelectField, TextAreaField, TextField } from '../ui/fields';
import { useToast } from '../lib/toast';
import './pages.css';

export function Income() {
  const today = useToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [editing, setEditing] = useState<IncomeSource | 'new' | null>(null);
  const sources = useIncomeSources(month);
  const list = sources.data ?? [];
  const expected = sumMoney(list.map((s) => s.period.expected ?? '0'));
  const received = sumMoney(list.map((s) => s.period.received));
  const pending = sumMoney(list.map((s) => s.period.pending ?? '0'));

  return (
    <div className="page">
      <PageHeader
        title="Income"
        description="Salary, rent, interest and other money you expect. Received amounts come from income transactions linked to each source."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            Add income source
          </Button>
        }
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

      {sources.isPending ? (
        <LoadingRows />
      ) : sources.isError ? (
        <ErrorState error={sources.error} onRetry={() => void sources.refetch()} />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            title="No income sources yet"
            actions={
              <Button variant="primary" onClick={() => setEditing('new')}>
                Add income source
              </Button>
            }
          >
            Add your salary, a spouse&apos;s income, rent or freelance work to see what&apos;s still
            to come each month.
          </EmptyState>
        </Card>
      ) : (
        <>
          <section className="stat-grid" aria-label="Month totals">
            <Stat
              label="Expected"
              value={formatMoney(toMoneyString(expected))}
              note="From active sources due this month"
            />
            <Stat
              label="Received"
              value={formatMoney(toMoneyString(received))}
              note="Linked income transactions"
            />
            <Stat
              label="Still pending"
              value={formatMoney(toMoneyString(pending))}
              note="Expected minus received"
            />
          </section>
          <div className="account-grid">
            {list.map((source) => (
              <SourceCard key={source.id} source={source} onEdit={() => setEditing(source)} />
            ))}
          </div>
        </>
      )}

      <Dialog
        open={editing !== null}
        title={editing === 'new' ? 'Add income source' : 'Edit income source'}
        onClose={() => setEditing(null)}
      >
        {editing !== null ? (
          <IncomeSourceForm
            key={editing === 'new' ? 'new' : `${editing.id}:${editing.version}`}
            existing={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

function SourceCard({ source, onEdit }: { source: IncomeSource; onEdit: () => void }) {
  const lookups = useLookups();
  const toast = useToast();
  const remove = useMoneyMutation((id: string) => api('DELETE', `/income-sources/${id}`));
  const { period } = source;
  const progress =
    period.expected && new Money(period.expected).gt(0)
      ? Math.min(100, new Money(period.received).div(period.expected).times(100).toNumber())
      : null;
  const params = new URLSearchParams({
    type: 'income',
    incomeSourceId: source.id,
    returnTo: '/income',
  });
  if (source.receivingAccountId) params.set('accountId', source.receivingAccountId);
  if (period.pending && period.pending !== '0.00') params.set('amount', period.pending);

  return (
    <div className="account-card">
      <span className="account-card-top">
        <span>
          <span className="account-name">{source.name}</span>
          <span className="account-meta" style={{ display: 'block' }}>
            {INCOME_KIND_LABELS[source.kind]} · {INCOME_FREQUENCY_LABELS[source.frequency]}
            {source.expectedAmount ? ` · ${formatMoney(source.expectedAmount)}` : ''}
            {source.receivingAccountId
              ? ` · into ${lookups.accounts.get(source.receivingAccountId)?.nickname ?? 'account'}`
              : ''}
          </span>
        </span>
        {!source.active ? <Badge>Paused</Badge> : source.isDemo ? <Badge>Demo</Badge> : null}
      </span>
      <IncomeStatus period={period} />
      {progress !== null ? (
        <div
          className="meter"
          role="meter"
          aria-label={`${source.name} received`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div className="meter-fill" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      <div className="form-actions" style={{ marginTop: 'var(--space-2)' }}>
        <Link to={`/transactions/new?${params}`} className="btn btn-secondary btn-small">
          Record received
        </Link>
        <Button variant="ghost" className="btn-small" onClick={onEdit}>
          Edit
        </Button>
        <ConfirmButton
          onConfirm={() =>
            remove.mutate(source.id, {
              onSuccess: () => toast.show('Income source deleted. Its transactions remain.'),
            })
          }
        >
          Delete
        </ConfirmButton>
      </div>
    </div>
  );
}

function IncomeSourceForm({ existing, onDone }: { existing?: IncomeSource; onDone: () => void }) {
  const toast = useToast();
  const today = useToday();
  const lookups = useLookups();
  const [form, setForm] = useState({
    name: existing?.name ?? '',
    kind: existing?.kind ?? ('salary' as IncomeKind),
    frequency: existing?.frequency ?? ('monthly' as IncomeFrequency),
    expectedAmount: existing?.expectedAmount ?? '',
    startDate: existing?.startDate ?? `${today.slice(0, 7)}-01`,
    expectedDay: existing?.expectedDay ? String(existing.expectedDay) : '',
    receivingAccountId: existing?.receivingAccountId ?? '',
    taxNotes: existing?.taxNotes ?? '',
    notes: existing?.notes ?? '',
    active: existing?.active ?? true,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const irregular = form.frequency === 'irregular';

  const save = useMoneyMutation((payload: Record<string, unknown>) =>
    existing
      ? api('PATCH', `/income-sources/${existing.id}`, {
          body: payload,
          schema: incomeSourceSchema,
        })
      : api('POST', '/income-sources', { body: payload, schema: incomeSourceSchema }),
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    const payload = {
      name: form.name,
      kind: form.kind,
      frequency: form.frequency,
      expectedAmount: irregular ? null : cleanAmount(form.expectedAmount) || null,
      startDate: form.startDate,
      expectedDay: form.expectedDay ? Number(form.expectedDay) : null,
      receivingAccountId: form.receivingAccountId || null,
      taxNotes: orNull(form.taxNotes),
      notes: orNull(form.notes),
      active: form.active,
      ...(existing ? { version: existing.version } : {}),
    };
    const parsed = (existing ? incomeSourceUpdate : incomeSourceInput).safeParse(payload);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    save.mutate(payload, {
      onSuccess: () => {
        toast.show(existing ? 'Income source updated' : 'Income source added');
        onDone();
      },
      onError: (error) => setErrors(apiFieldErrors(error)),
    });
  }

  return (
    <form onSubmit={submit} noValidate className="stack">
      {errors.form ? (
        <p className="form-error" role="alert">
          {errors.form}
        </p>
      ) : null}
      <div className="form-grid">
        <TextField
          label="Name"
          placeholder="Salary – Employer"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          error={errors.name}
          maxLength={60}
          required
        />
        <SelectField
          label="Kind"
          value={form.kind}
          onChange={(e) => set('kind', e.target.value as IncomeKind)}
        >
          {INCOME_KINDS.map((k) => (
            <option key={k} value={k}>
              {INCOME_KIND_LABELS[k]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="How often"
          value={form.frequency}
          onChange={(e) => set('frequency', e.target.value as IncomeFrequency)}
        >
          {INCOME_FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {INCOME_FREQUENCY_LABELS[f]}
            </option>
          ))}
        </SelectField>
        {!irregular ? (
          <AmountField
            label="Expected amount (₹)"
            optional
            value={form.expectedAmount}
            onChange={(v) => set('expectedAmount', v)}
            error={errors.expectedAmount}
          />
        ) : null}
        <TextField
          label="Starts"
          type="date"
          value={form.startDate}
          onChange={(e) => set('startDate', e.target.value)}
          error={errors.startDate}
          hint={irregular ? undefined : 'Quarterly and yearly sources repeat from this month.'}
          required
        />
        <TextField
          label="Usually arrives on day"
          optional
          type="number"
          min={1}
          max={31}
          value={form.expectedDay}
          onChange={(e) => set('expectedDay', e.target.value)}
          error={errors.expectedDay}
        />
        <SelectField
          label="Received into"
          optional
          value={form.receivingAccountId}
          onChange={(e) => set('receivingAccountId', e.target.value)}
          error={errors.receivingAccountId}
        >
          <option value="">Not set</option>
          {lookups.accountList
            .filter((a) => a.status === 'active' || a.id === form.receivingAccountId)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname}
              </option>
            ))}
        </SelectField>
        {existing ? (
          <SelectField
            label="Status"
            value={form.active ? 'active' : 'paused'}
            onChange={(e) => set('active', e.target.value === 'active')}
            hint="Paused sources aren't expected."
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </SelectField>
        ) : null}
        <TextAreaField
          label="Tax notes"
          optional
          className="span-all"
          value={form.taxNotes}
          onChange={(e) => set('taxNotes', e.target.value)}
          hint="e.g. TDS deducted, Form 16. Not tax advice."
          maxLength={300}
        />
      </div>
      <div className="form-actions" style={{ marginTop: 0 }}>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : existing ? 'Save changes' : 'Add income source'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
