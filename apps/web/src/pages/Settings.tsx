import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import {
  category as categorySchema,
  categoryInput,
  demoStatus,
  updateProfileInput,
  user as userSchema,
  type Category,
  type CategoryKind,
} from '@smartfin/shared';
import { api, describeError } from '../api/client';
import {
  invalidateMoney,
  keys,
  storeSession,
  useCategories,
  useDemoStatus,
  useSession,
} from '../api/queries';
import { useUser } from '../auth/session';
import { SystemStatus } from '../components/SystemStatus';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '../lib/forms';
import {
  Badge,
  Button,
  Card,
  ConfirmButton,
  LoadingRows,
  PageHeader,
  Segmented,
} from '../ui/components';
import { SelectField, TextField } from '../ui/fields';
import { useToast } from '../lib/toast';
import './pages.css';

export function Settings() {
  return (
    <div className="page">
      <PageHeader title="Settings" />
      <div className="two-col">
        <Profile />
        <DemoData />
      </div>
      <Categories />
      <div className="two-col">
        <SystemStatus />
        <SignOut />
      </div>
    </div>
  );
}

const TIME_ZONES = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['Asia/Kolkata'];
  }
})();

function Profile() {
  const user = useUser();
  const session = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ displayName: user.displayName, timeZone: user.timeZone });
  const [errors, setErrors] = useState<FieldErrors>({});
  const save = useMutation({
    mutationFn: (body: unknown) => api('PATCH', '/me', { body, schema: userSchema }),
    onSuccess: (updated) => {
      if (session.data) storeSession(queryClient, { ...session.data, user: updated });
      invalidateMoney(queryClient);
      toast.show('Profile saved');
    },
    onError: (error) => setErrors(apiFieldErrors(error)),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = updateProfileInput.safeParse(form);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  }

  return (
    <Card title="Profile" subtitle={user.email}>
      <form onSubmit={submit} noValidate className="stack">
        {errors.form ? <p className="form-error">{errors.form}</p> : null}
        <TextField
          label="Name"
          value={form.displayName}
          onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          error={errors.displayName}
          maxLength={60}
        />
        <SelectField
          label="Time zone"
          value={form.timeZone}
          onChange={(e) => setForm({ ...form, timeZone: e.target.value })}
          error={errors.timeZone}
          hint="Decides which day a transaction belongs to and what “this month” means."
        >
          {TIME_ZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </SelectField>
        <p className="field-hint">Currency: Indian Rupee (₹). Other currencies come later.</p>
        <div>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save profile'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function DemoData() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const status = useDemoStatus();
  const load = useMutation({
    mutationFn: () => api('POST', '/demo', { schema: demoStatus }),
    onSuccess: (s) => {
      invalidateMoney(queryClient);
      toast.show(`Demo data loaded: ${s.accounts} accounts, ${s.transactions} transactions.`);
    },
    onError: (error) => toast.show(describeError(error), { tone: 'error' }),
  });
  const reset = useMutation({
    mutationFn: () =>
      api('DELETE', '/demo', {
        schema: z.object({ removed: z.object({ accounts: z.number(), transactions: z.number() }) }),
      }),
    onSuccess: (r) => {
      invalidateMoney(queryClient);
      toast.show(
        `Removed ${r.removed.accounts} demo accounts and ${r.removed.transactions} transactions.`,
      );
    },
    onError: (error) => toast.show(describeError(error), { tone: 'error' }),
  });

  return (
    <Card
      title="Demo data"
      subtitle="About three months of synthetic salary, bills, UPI spends and transfers. Fictional banks and merchants."
    >
      {status.isPending ? (
        <LoadingRows rows={1} />
      ) : status.data?.loaded ? (
        <div className="stack">
          <p>
            <Badge>Loaded</Badge> {status.data.accounts} demo accounts with{' '}
            {status.data.transactions} transactions.
          </p>
          <p className="field-hint">
            Removing it deletes the demo accounts and every transaction in them, including any you
            added there.
          </p>
          <div>
            <ConfirmButton
              confirmLabel="Yes, remove demo data"
              onConfirm={() => reset.mutate()}
              disabled={reset.isPending}
            >
              Remove demo data
            </ConfirmButton>
          </div>
        </div>
      ) : (
        <div className="stack">
          <p className="muted">Not loaded. Your own accounts are never touched.</p>
          <div>
            <Button onClick={() => load.mutate()} disabled={load.isPending}>
              {load.isPending ? 'Loading…' : 'Load demo data'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Categories() {
  const categories = useCategories();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const refresh = () => void queryClient.invalidateQueries({ queryKey: keys.categories });

  const create = useMutation({
    mutationFn: (body: unknown) => api('POST', '/categories', { body, schema: categorySchema }),
    onSuccess: () => {
      refresh();
      setName('');
      toast.show('Category added');
    },
    onError: (error) => setErrors(apiFieldErrors(error)),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) =>
      api('PATCH', `/categories/${id}`, { body, schema: categorySchema }),
    onSuccess: refresh,
    onError: (error) => toast.show(describeError(error), { tone: 'error' }),
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api('DELETE', `/categories/${id}`, {
        schema: z.object({ deleted: z.boolean(), archived: z.boolean() }),
      }),
    onSuccess: (r) => {
      refresh();
      toast.show(
        r.archived ? 'Category is in use, so it was archived instead' : 'Category deleted',
      );
    },
    onError: (error) => toast.show(describeError(error), { tone: 'error' }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = categoryInput.safeParse({ name, kind });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    create.mutate(parsed.data);
  }

  const list = (categories.data ?? []).filter((c) => c.kind === kind);
  const custom = list.filter((c) => !c.system);
  const builtIn = list.filter((c) => c.system);

  return (
    <Card
      title="Categories"
      subtitle="Built-in categories can’t be changed; add your own alongside them."
    >
      <div className="stack">
        <Segmented
          label="Category kind"
          value={kind}
          options={[
            { value: 'expense', label: 'Spending' },
            { value: 'income', label: 'Income' },
          ]}
          onChange={setKind}
        />
        <form onSubmit={submit} noValidate className="filter-bar">
          <TextField
            label={`New ${kind === 'expense' ? 'spending' : 'income'} category`}
            className="grow"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name ?? errors.form}
            maxLength={40}
          />
          <Button type="submit" disabled={create.isPending}>
            Add
          </Button>
        </form>
        {categories.isPending ? (
          <LoadingRows />
        ) : (
          <>
            {custom.length > 0 ? (
              <ul className="mini-list">
                {custom.map((c) => (
                  <CustomCategory
                    key={c.id}
                    category={c}
                    onRename={(newName) => update.mutate({ id: c.id, body: { name: newName } })}
                    onToggleArchive={() =>
                      update.mutate({ id: c.id, body: { archived: !c.archived } })
                    }
                    onDelete={() => remove.mutate(c.id)}
                  />
                ))}
              </ul>
            ) : (
              <p className="muted">No custom categories yet.</p>
            )}
            <details>
              <summary>Built-in ({builtIn.length})</summary>
              <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
                {builtIn.map((c) => c.name).join(' · ')}
              </p>
            </details>
          </>
        )}
      </div>
    </Card>
  );
}

function CustomCategory({
  category,
  onRename,
  onToggleArchive,
  onDelete,
}: {
  category: Category;
  onRename: (name: string) => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  if (editing) {
    return (
      <li>
        <form
          className="filter-bar"
          style={{ flex: 1 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onRename(name.trim());
            setEditing(false);
          }}
        >
          <TextField
            label="Name"
            className="grow"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
          />
          <Button type="submit" className="btn-small">
            Save
          </Button>
          <Button variant="ghost" className="btn-small" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      </li>
    );
  }
  return (
    <li>
      <span>
        {category.name} {category.archived ? <Badge>Archived</Badge> : null}
      </span>
      <span className="confirm-inline">
        <Button variant="ghost" className="btn-small" onClick={() => setEditing(true)}>
          Rename
        </Button>
        <Button variant="ghost" className="btn-small" onClick={onToggleArchive}>
          {category.archived ? 'Unarchive' : 'Archive'}
        </Button>
        <ConfirmButton onConfirm={onDelete}>Delete</ConfirmButton>
      </span>
    </li>
  );
}

function SignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const signOut = useMutation({
    mutationFn: () => api('POST', '/auth/signout'),
    onSuccess: () => {
      queryClient.clear();
      storeSession(queryClient, null);
      navigate('/signin', { replace: true });
    },
    onError: (error) => toast.show(describeError(error), { tone: 'error' }),
  });
  return (
    <Card title="Account">
      <div className="stack">
        <p className="muted">
          Read the <Link to="/privacy">privacy notice</Link>. Data export and account deletion are
          coming in a later release.
        </p>
        <div>
          <Button onClick={() => signOut.mutate()} disabled={signOut.isPending}>
            Sign out
          </Button>
        </div>
      </div>
    </Card>
  );
}
