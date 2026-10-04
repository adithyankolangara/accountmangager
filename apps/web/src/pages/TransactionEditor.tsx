import { useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import {
  checkTransactionShape,
  createTransactionResponse,
  ENTRY_TRANSACTION_TYPES,
  formatDateTime,
  formatFinancialDate,
  formatMoney,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  transaction as transactionSchema,
  TRANSACTION_TYPE_LABELS,
  transactionInput,
  transactionUpdate,
  type AuditEntry,
  type Transaction,
} from '@smartfin/shared';
import type { z } from 'zod';
import { api, ApiRequestError } from '../api/client';
import {
  useIncomeSources,
  useMoneyMutation,
  useTransaction,
  useTransactionHistory,
} from '../api/queries';
import { useToday, useUser } from '../auth/session';
import { SourceBadge } from '../components/TransactionItem';
import {
  apiFieldErrors,
  cleanAmount,
  orNull,
  zodFieldErrors,
  type FieldErrors,
} from '../lib/forms';
import { lastAccount, rememberAccount, useLookups } from '../lib/lookups';
import {
  Button,
  Card,
  ConfirmButton,
  ErrorState,
  LoadingRows,
  PageHeader,
  Segmented,
} from '../ui/components';
import { AmountField, SelectField, TextAreaField, TextField } from '../ui/fields';
import { useToast } from '../lib/toast';
import './pages.css';

type EntryType = (typeof ENTRY_TRANSACTION_TYPES)[number];

export function TransactionEditor() {
  const { id } = useParams();
  const existing = useTransaction(id);
  const lookups = useLookups();
  // The form picks its default account on first render, so accounts must be loaded first.
  if (lookups.isPending || (id && existing.isPending)) {
    return (
      <div className="page">
        <LoadingRows rows={5} />
      </div>
    );
  }
  if (!id) return <TransactionForm />;
  if (existing.isError)
    return <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />;
  return (
    <TransactionForm
      key={`${existing.data!.id}:${existing.data!.version}`}
      existing={existing.data!}
    />
  );
}

interface FormState {
  type: Transaction['type'];
  amount: string;
  valueDate: string;
  accountId: string;
  counterAccountId: string;
  categoryId: string;
  incomeSourceId: string;
  paymentMethod: string;
  description: string;
  merchant: string;
  reference: string;
  notes: string;
  tags: string;
}

function TransactionForm({ existing }: { existing?: Transaction }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const toast = useToast();
  const user = useUser();
  const today = useToday();
  const lookups = useLookups();
  const income = useIncomeSources(today.slice(0, 7));
  const returnTo = params.get('returnTo')?.startsWith('/')
    ? params.get('returnTo')!
    : '/transactions';

  const activeAccounts = lookups.accountList.filter((a) => a.status === 'active');
  const defaultAccount =
    params.get('accountId') ??
    activeAccounts.find((a) => a.id === lastAccount())?.id ??
    activeAccounts[0]?.id ??
    '';

  const [form, setForm] = useState<FormState>(() =>
    existing
      ? {
          type: existing.type,
          amount: existing.amount,
          valueDate: existing.valueDate,
          accountId: existing.accountId,
          counterAccountId: existing.counterAccountId ?? '',
          categoryId: existing.categoryId ?? '',
          incomeSourceId: existing.incomeSourceId ?? '',
          paymentMethod: existing.paymentMethod ?? '',
          description: existing.description ?? '',
          merchant: existing.merchant ?? '',
          reference: existing.reference ?? '',
          notes: existing.notes ?? '',
          tags: existing.tags.join(', '),
        }
      : {
          type: (ENTRY_TRANSACTION_TYPES as readonly string[]).includes(params.get('type') ?? '')
            ? (params.get('type') as EntryType)
            : 'expense',
          amount: params.get('amount') ?? '',
          valueDate: today,
          accountId: defaultAccount,
          counterAccountId: '',
          categoryId: '',
          incomeSourceId: params.get('incomeSourceId') ?? '',
          paymentMethod: '',
          description: '',
          merchant: '',
          reference: '',
          notes: '',
          tags: '',
        },
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const isSystem = existing
    ? !(ENTRY_TRANSACTION_TYPES as readonly string[]).includes(existing.type)
    : false;
  const deleted = Boolean(existing?.deletedAt);
  const categoryKind = form.type === 'income' ? 'income' : 'expense';
  const categories = lookups.categoryList.filter(
    (c) => c.kind === categoryKind && (!c.archived || c.id === form.categoryId),
  );
  const accountOptions = lookups.accountList.filter(
    (a) => a.status === 'active' || a.id === form.accountId || a.id === form.counterAccountId,
  );

  const save = useMoneyMutation(async (payload: Record<string, unknown>) =>
    existing
      ? {
          transaction: await api('PATCH', `/transactions/${existing.id}`, {
            body: payload,
            schema: transactionSchema,
          }),
          possibleDuplicates: [],
        }
      : api('POST', '/transactions', { body: payload, schema: createTransactionResponse }),
  );
  const remove = useMoneyMutation((txId: string) => api('DELETE', `/transactions/${txId}`));
  const restore = useMoneyMutation((txId: string) =>
    api('POST', `/transactions/${txId}/restore`, { schema: transactionSchema }),
  );

  function buildPayload() {
    const transfer = form.type === 'transfer';
    const payload: Record<string, unknown> = {
      amount: cleanAmount(form.amount),
      valueDate: form.valueDate,
      description: orNull(form.description),
      notes: orNull(form.notes),
    };
    if (isSystem) return payload;
    return {
      ...payload,
      type: form.type,
      accountId: form.accountId,
      counterAccountId: transfer ? form.counterAccountId || null : null,
      categoryId: transfer ? null : form.categoryId || null,
      incomeSourceId: form.type === 'income' ? form.incomeSourceId || null : null,
      paymentMethod: form.paymentMethod || null,
      merchant: orNull(form.merchant),
      reference: orNull(form.reference),
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const payload = buildPayload();
    const parsed = existing
      ? transactionUpdate
          .superRefine((v, ctx) => {
            if (!isSystem)
              checkTransactionShape(v as Parameters<typeof checkTransactionShape>[0], ctx);
          })
          .safeParse({ ...payload, version: existing.version })
      : transactionInput.safeParse(payload);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error as z.ZodError));
      return;
    }
    setErrors({});
    save.mutate(existing ? { ...payload, version: existing.version } : payload, {
      onSuccess: (result) => {
        rememberAccount(form.accountId);
        const dup = result.possibleDuplicates[0];
        if (dup) {
          toast.show(
            `Saved. A similar ${formatMoney(dup.amount)} transaction exists on ${formatFinancialDate(dup.valueDate)}.`,
            {
              tone: 'info',
              action: {
                label: 'Undo',
                onClick: () => remove.mutate(result.transaction.id),
              },
            },
          );
        } else {
          toast.show(existing ? 'Changes saved' : 'Transaction saved');
        }
        navigate(returnTo);
      },
      onError: (error) => {
        setErrors(
          error instanceof ApiRequestError && error.status === 409
            ? { form: error.message }
            : apiFieldErrors(error),
        );
      },
    });
  }

  if (!existing && activeAccounts.length === 0 && !lookups.isPending) {
    return (
      <div className="page">
        <PageHeader title="Add transaction" />
        <Card>
          <p>Add an account first: transactions always belong to a bank account, cash or wallet.</p>
          <div className="form-actions">
            <Button variant="primary" onClick={() => navigate('/accounts/new')}>
              Add an account
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title={
          existing
            ? isSystem
              ? TRANSACTION_TYPE_LABELS[existing.type]
              : 'Edit transaction'
            : 'Add transaction'
        }
        description={
          existing ? (
            <>
              <SourceBadge tx={existing} /> Created{' '}
              {formatDateTime(existing.createdAt, user.timeZone)}
            </>
          ) : undefined
        }
      />

      {deleted ? (
        <Card>
          <p>This transaction is deleted and doesn&apos;t count towards any balance or report.</p>
          <div className="form-actions">
            <Button
              variant="primary"
              onClick={() =>
                restore.mutate(existing!.id, {
                  onSuccess: () => toast.show('Transaction restored'),
                  onError: (error) => setErrors(apiFieldErrors(error)),
                })
              }
              disabled={restore.isPending}
            >
              Restore
            </Button>
          </div>
        </Card>
      ) : null}

      <Card>
        <form onSubmit={submit} noValidate>
          <fieldset disabled={deleted || save.isPending} className="plain-fieldset">
            {errors.form ? (
              <p className="form-error" role="alert">
                {errors.form}
              </p>
            ) : null}
            {!isSystem ? (
              <Segmented
                label="Transaction type"
                value={form.type as EntryType}
                options={ENTRY_TRANSACTION_TYPES.map((t) => ({
                  value: t,
                  label: TRANSACTION_TYPE_LABELS[t],
                }))}
                onChange={(type) => setForm((f) => ({ ...f, type, categoryId: '' }))}
              />
            ) : null}
            <div className="form-grid" style={{ marginTop: 'var(--space-4)' }}>
              <AmountField
                label="Amount (₹)"
                value={form.amount}
                onChange={(v) => set('amount', v)}
                error={errors.amount}
                autoFocus={!existing}
                required
              />
              <TextField
                label="Date"
                type="date"
                value={form.valueDate}
                onChange={(e) => set('valueDate', e.target.value)}
                error={errors.valueDate}
                required
              />
              <SelectField
                label={
                  form.type === 'transfer'
                    ? 'From account'
                    : form.type === 'expense'
                      ? 'Paid from'
                      : 'Received in'
                }
                value={form.accountId}
                onChange={(e) => set('accountId', e.target.value)}
                error={errors.accountId}
                disabled={isSystem}
                required
              >
                <option value="">Choose an account</option>
                {accountOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nickname}
                  </option>
                ))}
              </SelectField>
              {form.type === 'transfer' ? (
                <SelectField
                  label="To account"
                  value={form.counterAccountId}
                  onChange={(e) => set('counterAccountId', e.target.value)}
                  error={errors.counterAccountId}
                  required
                >
                  <option value="">Choose an account</option>
                  {accountOptions
                    .filter((a) => a.id !== form.accountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nickname}
                      </option>
                    ))}
                </SelectField>
              ) : !isSystem ? (
                <SelectField
                  label="Category"
                  optional
                  value={form.categoryId}
                  onChange={(e) => set('categoryId', e.target.value)}
                  error={errors.categoryId}
                >
                  <option value="">Uncategorised</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </SelectField>
              ) : null}
              {form.type === 'income' && (income.data?.length ?? 0) > 0 ? (
                <SelectField
                  label="Income source"
                  optional
                  value={form.incomeSourceId}
                  onChange={(e) => set('incomeSourceId', e.target.value)}
                  error={errors.incomeSourceId}
                  hint="Counts towards what you expected from this source."
                >
                  <option value="">None</option>
                  {income.data!.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </SelectField>
              ) : null}
              <TextField
                label="Description"
                optional
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                error={errors.description}
                maxLength={200}
              />
              {!isSystem ? (
                <>
                  <TextField
                    label={form.type === 'income' ? 'From (payer)' : 'Merchant'}
                    optional
                    value={form.merchant}
                    onChange={(e) => set('merchant', e.target.value)}
                    error={errors.merchant}
                    maxLength={100}
                  />
                  <SelectField
                    label="Payment method"
                    optional
                    value={form.paymentMethod}
                    onChange={(e) => set('paymentMethod', e.target.value)}
                  >
                    <option value="">Not specified</option>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </SelectField>
                  <TextField
                    label="Reference"
                    optional
                    hint="UPI/UTR reference, cheque number. Helps spot duplicates."
                    value={form.reference}
                    onChange={(e) => set('reference', e.target.value)}
                    error={errors.reference}
                    maxLength={64}
                  />
                  <TextField
                    label="Tags"
                    optional
                    hint="Comma-separated, e.g. trip, festival"
                    value={form.tags}
                    onChange={(e) => set('tags', e.target.value)}
                    error={errors.tags}
                  />
                </>
              ) : null}
              <TextAreaField
                label="Notes"
                optional
                className="span-all"
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                error={errors.notes}
                maxLength={1000}
              />
            </div>
            <div className="form-actions">
              <Button type="submit" variant="primary">
                {save.isPending ? 'Saving…' : existing ? 'Save changes' : 'Save transaction'}
              </Button>
              <Button variant="ghost" onClick={() => navigate(returnTo)}>
                Cancel
              </Button>
              {existing && !deleted ? (
                <span style={{ marginLeft: 'auto' }}>
                  <ConfirmButton
                    onConfirm={() =>
                      remove.mutate(existing.id, {
                        onSuccess: () => {
                          toast.show('Transaction deleted', {
                            action: { label: 'Undo', onClick: () => restore.mutate(existing.id) },
                          });
                          navigate(returnTo);
                        },
                        onError: (error) => setErrors(apiFieldErrors(error)),
                      })
                    }
                  >
                    Delete
                  </ConfirmButton>
                </span>
              ) : null}
            </div>
          </fieldset>
        </form>
      </Card>

      {existing ? <History id={existing.id} /> : null}
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = {
  type: 'Type',
  amount: 'Amount',
  valueDate: 'Date',
  accountId: 'Account',
  counterAccountId: 'To account',
  categoryId: 'Category',
  incomeSourceId: 'Income source',
  description: 'Description',
  merchant: 'Merchant',
  paymentMethod: 'Payment method',
  reference: 'Reference',
  tags: 'Tags',
  notes: 'Notes',
  status: 'Status',
};

const ACTION_LABELS: Record<string, string> = {
  'transaction.create': 'Created',
  'transaction.update': 'Edited',
  'transaction.delete': 'Deleted',
  'transaction.restore': 'Restored',
};

function History({ id }: { id: string }) {
  const user = useUser();
  const lookups = useLookups();
  const history = useTransactionHistory(id);

  function show(field: string, value: unknown): string {
    if (value === null || value === undefined || value === '') return 'empty';
    if (field === 'amount') return formatMoney(String(value));
    if (field === 'valueDate') return formatFinancialDate(String(value));
    if (field === 'accountId' || field === 'counterAccountId')
      return lookups.accounts.get(String(value))?.nickname ?? 'an account';
    if (field === 'categoryId') return lookups.categories.get(String(value))?.name ?? 'a category';
    if (Array.isArray(value)) return value.join(', ') || 'empty';
    return String(value);
  }

  return (
    <Card title="Change history" subtitle="Every change to this transaction is recorded.">
      {history.isPending ? (
        <LoadingRows rows={2} />
      ) : history.isError ? (
        <ErrorState error={history.error} />
      ) : history.data.length === 0 ? (
        <p className="muted">
          No recorded changes. Imported and demo transactions start their history at their first
          edit.
        </p>
      ) : (
        <ol className="history-list">
          {history.data.map((entry: AuditEntry) => (
            <li key={entry.id}>
              <strong>
                {ACTION_LABELS[entry.action] ?? entry.action} ·{' '}
                {formatDateTime(entry.createdAt, user.timeZone)}
              </strong>
              {entry.changes
                ? Object.entries(entry.changes).map(([field, change]) => (
                    <span key={field} className="muted">
                      {FIELD_LABELS[field] ?? field}: {show(field, change.from)} →{' '}
                      {show(field, change.to)}
                    </span>
                  ))
                : null}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
