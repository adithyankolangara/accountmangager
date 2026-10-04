import { useQuery } from '@tanstack/react-query';
import { formatDateTime, healthResponse, readinessResponse } from '@smartfin/shared';
import { apiGet, ApiRequestError } from '../api/client';
import { Badge, Button, Card, Skeleton } from '../ui/components';
import './Dashboard.css';

export function Dashboard() {
  return (
    <div className="page">
      <header className="page-header">
        <h1>Dashboard</h1>
        <p className="muted">
          Your accounts, spending and net worth will appear here once money tracking arrives in
          milestone M2.
        </p>
      </header>
      <div className="dashboard-grid">
        <SystemStatus />
      </div>
    </div>
  );
}

function SystemStatus() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => apiGet('/health', healthResponse, { signal }),
  });
  const ready = useQuery({
    queryKey: ['health', 'ready'],
    queryFn: ({ signal }) =>
      apiGet('/health/ready', readinessResponse, { signal, acceptStatuses: [503] }),
  });

  const loading = health.isPending || ready.isPending;
  const refreshing = health.isFetching || ready.isFetching;
  const unreachable = health.isError || ready.isError;
  const operational = health.isSuccess && ready.data?.status === 'ready';
  const checkedAt = Math.max(health.dataUpdatedAt, health.errorUpdatedAt);

  return (
    <Card
      title="System status"
      subtitle={checkedAt ? `Checked ${formatDateTime(new Date(checkedAt))}` : 'Checking…'}
      actions={
        <Button
          onClick={() => void Promise.all([health.refetch(), ready.refetch()])}
          disabled={refreshing}
        >
          {refreshing ? 'Checking…' : 'Check again'}
        </Button>
      }
    >
      {loading ? (
        <div className="status-loading" aria-busy="true" aria-label="Checking system status">
          <Skeleton width="40%" />
          <Skeleton width="70%" />
        </div>
      ) : unreachable ? (
        <div role="status">
          <Badge tone="danger" dot>
            Unavailable
          </Badge>
          <p className="status-message">{describeError(health.error ?? ready.error)}</p>
        </div>
      ) : (
        <div role="status">
          <Badge tone={operational ? 'success' : 'warning'} dot>
            {operational ? 'Operational' : 'Degraded'}
          </Badge>
          <dl className="details status-details">
            <dt>API</dt>
            <dd>
              Running · version <span className="mono">{health.data?.version}</span>
            </dd>
            <dt>Database</dt>
            <dd>{ready.data?.checks.database === 'ok' ? 'Connected' : 'Unreachable'}</dd>
            <dt>Migrations</dt>
            <dd>{migrationLabel(ready.data?.checks.migrations)}</dd>
          </dl>
        </div>
      )}
    </Card>
  );
}

function migrationLabel(state: 'ok' | 'pending' | 'error' | undefined): string {
  if (state === 'ok') return 'Up to date';
  if (state === 'pending') return 'Pending: run npm run db:migrate';
  return 'Unknown';
}

function describeError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const ref = error.requestId ? ` (reference ${error.requestId})` : '';
    return `${error.message}${ref}.`;
  }
  return 'Could not reach the SmartFin server.';
}
