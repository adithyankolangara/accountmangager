import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import {
  account as accountSchema,
  ACCOUNT_KIND_LABELS,
  ACCOUNT_KINDS,
  accountInput,
  accountUpdate,
  type Account,
  type AccountKind,
} from '@smartfin/shared';
import { api, apiGet, ApiRequestError } from '../api/client';
import { useMoneyMutation } from '../api/queries';
import { useToday } from '../auth/session';
import {
  apiFieldErrors,
  cleanAmount,
  orNull,
  zodFieldErrors,
  type FieldErrors,
} from '../lib/forms';
import { Button, Card, ConfirmButton, ErrorState, LoadingRows, PageHeader } from '../ui/components';
import { AmountField, SelectField, TextAreaField, TextField } from '../ui/fields';
import { useToast } from '../lib/toast';
import './pages.css';

export function AccountEditor() {
  const { id } = useParams();
  const existing = useQuery({
    queryKey: ['accounts', id],
    queryFn: ({ signal }) => apiGet(`/accounts/${id}`, accountSchema, { signal }),
    enabled: Boolean(id),
  });
  if (!id) return <AccountForm />;
  if (existing.isPending) return <LoadingRows rows={5} />;
  if (existing.isError)
    return <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />;
  return <AccountForm key={existing.data.version} existing={existing.data} />;
}

function AccountForm({ existing }: { existing?: Account }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const toast = useToast();
  const today = useToday();
  const kindParam = params.get('kind');
  const [form, setForm] = useState({
    nickname: existing?.nickname ?? '',
    kind:
      existing?.kind ??
      ((ACCOUNT_KINDS as readonly string[]).includes(kindParam ?? '')
        ? (kindParam as AccountKind)
        : 'savings'),
    institution: existing?.institution ?? '',
    maskedReference: existing?.maskedReference ?? '',
    ifsc: existing?.ifsc ?? '',
    branch: existing?.branch ?? '',
    openingBalance: existing?.openingBalance ?? '',
    openingDate: existing?.openingDate ?? today,
    notes: existing?.notes ?? '',
    status: existing?.status ?? 'active',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const isCash = form.kind === 'cash' || form.kind === 'wallet';

  const save = useMoneyMutation((payload: Record<string, unknown>) =>
    existing
      ? api('PATCH', `/accounts/${existing.id}`, { body: payload, schema: accountSchema })
      : api('POST', '/accounts', { body: payload, schema: accountSchema }),
  );
  const remove = useMoneyMutation((accountId: string) => api('DELETE', `/accounts/${accountId}`));

  function submit(event: FormEvent) {
    event.preventDefault();
    const payload = {
      nickname: form.nickname,
      kind: form.kind,
      institution: orNull(form.institution),
      maskedReference: isCash ? null : orNull(form.maskedReference),
      ifsc: isCash ? null : orNull(form.ifsc),
      branch: isCash ? null : orNull(form.branch),
      openingBalance: cleanAmount(form.openingBalance) || '0',
      openingDate: form.openingDate,
      notes: orNull(form.notes),
      ...(existing ? { status: form.status, version: existing.version } : {}),
    };
    const parsed = (existing ? accountUpdate : accountInput).safeParse(payload);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    save.mutate(payload, {
      onSuccess: (saved) => {
        toast.show(existing ? 'Account updated' : 'Account added');
        navigate(`/accounts/${saved.id}`);
      },
      onError: (error) =>
        setErrors(
          error instanceof ApiRequestError && error.status === 409
            ? { form: error.message }
            : apiFieldErrors(error),
        ),
    });
  }

  return (
    <div className="page">
      <PageHeader
        title={existing ? `Edit ${existing.nickname}` : 'Add account'}
        description="Only the last four digits of an account number are stored, and never any banking passwords."
      />
      <Card>
        <form onSubmit={submit} noValidate>
          {errors.form ? (
            <p className="form-error" role="alert">
              {errors.form}
            </p>
          ) : null}
          <div className="form-grid">
            <TextField
              label="Name"
              placeholder={isCash ? 'Cash in hand' : 'Salary account'}
              value={form.nickname}
              onChange={(e) => set('nickname', e.target.value)}
              error={errors.nickname}
              maxLength={60}
              required
              autoFocus={!existing}
            />
            <SelectField
              label="Type"
              value={form.kind}
              onChange={(e) => set('kind', e.target.value as AccountKind)}
            >
              {ACCOUNT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ACCOUNT_KIND_LABELS[k]}
                </option>
              ))}
            </SelectField>
            <TextField
              label={isCash ? 'Provider' : 'Bank'}
              optional
              value={form.institution}
              onChange={(e) => set('institution', e.target.value)}
              error={errors.institution}
              maxLength={80}
            />
            {!isCash ? (
              <>
                <TextField
                  label="Last 4 digits of account number"
                  optional
                  inputMode="numeric"
                  maxLength={4}
                  value={form.maskedReference}
                  onChange={(e) => set('maskedReference', e.target.value)}
                  error={errors.maskedReference}
                  hint="Helps you tell accounts apart. Never enter the full number."
                />
                <TextField
                  label="IFSC"
                  optional
                  maxLength={11}
                  value={form.ifsc}
                  onChange={(e) => set('ifsc', e.target.value.toUpperCase())}
                  error={errors.ifsc}
                />
                <TextField
                  label="Branch"
                  optional
                  value={form.branch}
                  onChange={(e) => set('branch', e.target.value)}
                  error={errors.branch}
                  maxLength={80}
                />
              </>
            ) : null}
            <AmountField
              label="Opening balance (₹)"
              allowNegative
              value={form.openingBalance}
              onChange={(v) => set('openingBalance', v)}
              error={errors.openingBalance}
              hint="The balance on the opening date, before any transactions you'll record."
            />
            <TextField
              label="Opening date"
              type="date"
              value={form.openingDate}
              onChange={(e) => set('openingDate', e.target.value)}
              error={errors.openingDate}
              hint="Transactions dated before this don't change the balance."
              required
            />
            {existing ? (
              <SelectField
                label="Status"
                value={form.status}
                onChange={(e) => set('status', e.target.value as 'active' | 'closed')}
                hint="Closed accounts keep their history but accept no new transactions."
              >
                <option value="active">Active</option>
                <option value="closed">Closed</option>
              </SelectField>
            ) : null}
            <TextAreaField
              label="Notes"
              optional
              className="span-all"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              error={errors.notes}
              maxLength={500}
            />
          </div>
          <div className="form-actions">
            <Button type="submit" variant="primary" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : existing ? 'Save changes' : 'Add account'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate(existing ? `/accounts/${existing.id}` : '/accounts')}
            >
              Cancel
            </Button>
            {existing ? (
              <span style={{ marginLeft: 'auto' }}>
                <ConfirmButton
                  onConfirm={() =>
                    remove.mutate(existing.id, {
                      onSuccess: () => {
                        toast.show('Account deleted');
                        navigate('/accounts');
                      },
                      onError: (error) => setErrors(apiFieldErrors(error)),
                    })
                  }
                >
                  Delete account
                </ConfirmButton>
              </span>
            ) : null}
          </div>
        </form>
      </Card>
    </div>
  );
}
