import { z } from 'zod';

const email = z
  .email('Enter a valid email address')
  .max(254)
  .transform((v) => v.toLowerCase());

export const PASSWORD_MIN_LENGTH = 10;

export const signUpInput = z
  .object({
    displayName: z.string().trim().min(1, 'Enter your name').max(60),
    email,
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
      .max(128, 'At most 128 characters'),
    acceptPrivacyNotice: z.literal(true, {
      error: 'You need to accept the privacy notice to create an account',
    }),
  })
  .meta({ id: 'SignUpInput' });
export type SignUpInput = z.input<typeof signUpInput>;

export const signInInput = z
  .object({
    email,
    password: z.string().min(1, 'Enter your password').max(128),
  })
  .meta({ id: 'SignInInput' });
export type SignInInput = z.input<typeof signInInput>;

export const user = z
  .object({
    id: z.uuid(),
    email: z.string(),
    displayName: z.string(),
    preferredCurrency: z.string(),
    timeZone: z.string(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'User' });
export type User = z.infer<typeof user>;

export const sessionResponse = z
  .object({
    user,
    csrfToken: z.string().meta({
      description:
        'Send as X-SmartFin-CSRF on state-changing requests made with the session cookie.',
    }),
    /** Returned only by sign-up and sign-in, and only to clients that ask for bearer tokens. */
    sessionToken: z.string().optional(),
  })
  .meta({ id: 'Session' });
export type SessionResponse = z.infer<typeof sessionResponse>;

export const updateProfileInput = z
  .object({
    displayName: z.string().trim().min(1, 'Enter your name').max(60).optional(),
    timeZone: z.string().min(1).max(64).optional(),
  })
  .meta({ id: 'UpdateProfileInput' });
export type UpdateProfileInput = z.input<typeof updateProfileInput>;

/** Version of the privacy notice the user accepts at sign-up (see /privacy). */
export const PRIVACY_NOTICE_VERSION = '2026-10-04';
