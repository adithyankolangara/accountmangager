import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { sessionResponse, signInInput, type SignInInput } from '@smartfin/shared';
import { api } from '../api/client';
import { storeSession, useSession } from '../api/queries';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '../lib/forms';
import { Button } from '../ui/components';
import { TextField } from '../ui/fields';
import { AuthLayout } from './AuthLayout';
import { safeNext } from './session';

export function SignIn() {
  const session = useSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SignInInput>({ email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const next = safeNext(params.get('next'));

  const signIn = useMutation({
    mutationFn: (input: SignInInput) =>
      api('POST', '/auth/signin', { body: input, schema: sessionResponse }),
    onSuccess: (data) => {
      storeSession(queryClient, data);
      navigate(next, { replace: true });
    },
    onError: (error) => setErrors(apiFieldErrors(error)),
  });

  if (session.data) return <Navigate to={next} replace />;

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = signInInput.safeParse(form);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    signIn.mutate(parsed.data);
  }

  return (
    <AuthLayout
      title="Sign in"
      footer={
        <>
          New to SmartFin?{' '}
          <Link to={`/signup${params.size ? `?${params}` : ''}`}>Create an account</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={submit} noValidate>
        {errors.form ? (
          <p className="form-error" role="alert">
            {errors.form}
          </p>
        ) : null}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          error={errors.email}
          required
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={errors.password}
          required
        />
        <Button type="submit" variant="primary" disabled={signIn.isPending}>
          {signIn.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="field-hint">
          Forgot your password? Password reset by email isn&apos;t available yet.
        </p>
      </form>
    </AuthLayout>
  );
}
