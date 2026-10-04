import { Link } from 'react-router';
import { PAYMENT_METHOD_LABELS, type Transaction } from '@smartfin/shared';
import type { Lookups } from '../lib/lookups';
import { directionOf, transactionTitle } from '../lib/transactions';
import { Amount, Badge } from '../ui/components';

export function SourceBadge({ tx }: { tx: Transaction }) {
  if (tx.deletedAt) return <Badge tone="danger">Deleted</Badge>;
  if (tx.source === 'import') return <Badge tone="info">Imported</Badge>;
  if (tx.source === 'demo') return <Badge>Demo</Badge>;
  if (tx.type === 'adjustment') return <Badge tone="warning">Adjustment</Badge>;
  return null;
}

export function TransactionItem({
  tx,
  lookups,
  perspectiveAccountId,
}: {
  tx: Transaction;
  lookups: Lookups;
  perspectiveAccountId?: string;
}) {
  const account = lookups.accounts.get(tx.accountId)?.nickname ?? 'Account';
  const counter = tx.counterAccountId ? lookups.accounts.get(tx.counterAccountId)?.nickname : null;
  const category = tx.categoryId ? lookups.categories.get(tx.categoryId)?.name : null;
  const meta = [
    tx.type === 'transfer' ? `${account} → ${counter ?? 'account'}` : account,
    tx.type === 'transfer' ? 'Transfer' : category,
    tx.paymentMethod ? PAYMENT_METHOD_LABELS[tx.paymentMethod] : null,
  ].filter(Boolean);

  return (
    <li>
      <Link to={`/transactions/${tx.id}`} className="tx-row">
        <span className="tx-main">
          <span className="tx-title">{transactionTitle(tx, lookups)}</span>
          <span className="tx-meta">{meta.join(' · ')}</span>
        </span>
        <span className="tx-side">
          <Amount value={tx.amount} direction={directionOf(tx, perspectiveAccountId)} />
          <SourceBadge tx={tx} />
        </span>
      </Link>
    </li>
  );
}
