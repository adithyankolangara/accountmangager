import { formatMoney, type IncomeSource } from '@smartfin/shared';
import { Badge } from '../ui/components';

/** Expected-vs-received status for one income source in one month, as words plus colour. */
export function IncomeStatus({ period }: { period: IncomeSource['period'] }) {
  switch (period.status) {
    case 'received':
      return <Badge tone="success">Received {formatMoney(period.received)}</Badge>;
    case 'partial':
      return <Badge tone="warning">{formatMoney(period.pending ?? '0')} pending</Badge>;
    case 'pending':
      return <Badge tone="warning">Expected {formatMoney(period.expected ?? '0')}</Badge>;
    case 'not_expected':
      return period.received !== '0.00' ? (
        <Badge>Received {formatMoney(period.received)}</Badge>
      ) : (
        <Badge>Not expected this month</Badge>
      );
  }
}
