import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSession } from '../api/queries';
import { ErrorState, Skeleton } from '../ui/components';

export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) {
    return (
      <div className="splash" aria-busy="true" aria-label="Loading SmartFin">
        <Skeleton width="160px" />
      </div>
    );
  }
  if (session.isError) {
    return (
      <div className="splash">
        <ErrorState error={session.error} onRetry={() => void session.refetch()} />
      </div>
    );
  }
  if (!session.data) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/signin?next=${next}`} replace />;
  }
  return children;
}
