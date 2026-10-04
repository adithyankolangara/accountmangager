import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { PASSWORD_MIN_LENGTH, sessionResponse, signUpInput } from '@smartfin/shared';
import { api } from '../api/client';
import { storeSession, useSession } from '../api/queries';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '../lib/forms';
import { Button } from '../ui/components';
import { CheckboxField, TextField } from '../ui/fields';
import { AuthLayout } from './AuthLayout';
import { safeNext } from './session';

export function SignUp() {
  const session = useSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    password: '',
    acceptPrivacyNotice: false,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const next = safeNext(params.get('next'));

  const signUp = useMutation({
    mutationFn: (input: unknown) =>
      api('POST', '/auth/signup', { body: input, schema: sessionResponse }),
    onSuccess: (data) => {
      storeSession(queryClient, data);
      navigate(next, { replace: true });
    },
    onError: (error) => setErrors(apiFieldErrors(error)),
  });

  if (session.data) return <Navigate to={next} replace />;

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = signUpInput.safeParse(form);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    signUp.mutate(parsed.data);
  }

  return (
    <AuthLayout
      title="Create your account"
      footer={
        <>
          Already have an account?{' '}
          <Link to={`/signin${params.size ? `?${params}` : ''}`}>Sign in</Link>
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
          label="Your name"
          autoComplete="name"
          value={form.displayName}
          onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          error={errors.displayName}
          required
        />
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
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={errors.password}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short sentence is easy to remember.`}
          required
        />
        <CheckboxField
          label={
            <>
              I have read the{' '}
              <Link to="/privacy" target="_blank" rel="noreferrer">
                privacy notice
              </Link>
            </>
          }
          checked={form.acceptPrivacyNotice}
          onChange={(e) => setForm({ ...form, acceptPrivacyNotice: e.target.checked })}
        />
        {errors.acceptPrivacyNotice ? (
          <p className="field-error">{errors.acceptPrivacyNotice}</p>
        ) : null}
        <Button type="submit" variant="primary" disabled={signUp.isPending}>
          {signUp.isPending ? 'Creating account…' : 'Create account'}
        </Button>
        <p className="field-hint">
          SmartFin never asks for bank passwords, card numbers, PINs, CVVs or OTPs.
        </p>
      </form>
    </AuthLayout>
  );
}
