import { useQuery } from '@tanstack/react-query';
import { formatDateTime, healthResponse, readinessResponse } from '@smartfin/shared';
import { apiGet, describeError } from '../api/client';
import { Badge, Button, Card, Skeleton } from '../ui/components';

export function SystemStatus() {
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
        <div className="loading-rows" aria-busy="true" aria-label="Checking system status">
          <Skeleton width="40%" />
          <Skeleton width="70%" />
        </div>
      ) : unreachable ? (
        <div role="status">
          <Badge tone="danger" dot>
            Unavailable
          </Badge>
          <p className="field-hint" style={{ marginTop: 'var(--space-3)' }}>
            {describeError(health.error ?? ready.error)}
          </p>
        </div>
      ) : (
        <div role="status">
          <Badge tone={operational ? 'success' : 'warning'} dot>
            {operational ? 'Operational' : 'Degraded'}
          </Badge>
          <dl className="details" style={{ marginTop: 'var(--space-4)' }}>
            <dt>API</dt>
            <dd>
              Running · version <span className="mono">{health.data?.version}</span>
            </dd>
            <dt>Database</dt>
            <dd>{ready.data?.checks.database === 'ok' ? 'Connected' : 'Unreachable'}</dd>
            <dt>Migrations</dt>
            <dd>
              {ready.data?.checks.migrations === 'ok'
                ? 'Up to date'
                : ready.data?.checks.migrations === 'pending'
                  ? 'Pending: run npm run db:migrate'
                  : 'Unknown'}
            </dd>
          </dl>
        </div>
      )}
    </Card>
  );
}
