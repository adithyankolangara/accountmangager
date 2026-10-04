import { useState } from 'react';
import { toLocalDateString, type User } from '@smartfin/shared';
import { useSession } from '../api/queries';

/** The signed-in user. Only call inside routes wrapped by <RequireAuth>. */
export function useUser(): User {
  const { data } = useSession();
  if (!data) throw new Error('useUser called outside an authenticated route');
  return data.user;
}

/** Today's date (YYYY-MM-DD) in the user's time zone, fixed for the life of the component. */
export function useToday(): string {
  const user = useUser();
  const [today] = useState(() => toLocalDateString(new Date(), user.timeZone));
  return today;
}

/** Only same-site relative paths are allowed as post-sign-in destinations. */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}
