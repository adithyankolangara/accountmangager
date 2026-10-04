import { sql, type SQL } from 'drizzle-orm';

/**
 * Outer-query columns, written fully qualified on purpose: drizzle renders columns of a
 * single-table query without the table name, and inside these subqueries a bare "id" would
 * resolve to the inner table's id.
 */
const ACCOUNT_ID = sql.raw('"accounts"."id"');
const OPENING_BALANCE = sql.raw('"accounts"."opening_balance"');
const OPENING_DATE = sql.raw('"accounts"."opening_date"');

/**
 * Balance of the account in the enclosing query (correlated on accounts.id) as of a date:
 * opening balance plus every non-deleted transaction dated from the opening date to `asOf`.
 *
 * Ledger rules (docs/erd.md §2):
 *   income, refund                → + on account_id
 *   adjustment                    → ± on account_id by direction
 *   expense, liability_payment    → − on account_id
 *   transfer                      → − on account_id, + on counter_account_id
 */
export function balanceAsOf(asOf: string): SQL<string> {
  return sql<string>`(${OPENING_BALANCE} + coalesce((
    select sum(case
      when t.account_id = ${ACCOUNT_ID} and t.type in ('income', 'refund') then t.amount
      when t.account_id = ${ACCOUNT_ID} and t.type = 'adjustment'
        then case when t.direction = 'in' then t.amount else -t.amount end
      when t.account_id = ${ACCOUNT_ID} then -t.amount
      when t.counter_account_id = ${ACCOUNT_ID} then t.amount
      else 0 end)
    from transactions t
    where (t.account_id = ${ACCOUNT_ID} or t.counter_account_id = ${ACCOUNT_ID})
      and t.deleted_at is null
      and t.value_date >= ${OPENING_DATE}
      and t.value_date <= ${asOf}::date
  ), 0))::text`;
}

export const lastTransactionDate = sql<string | null>`(
  select max(t.value_date)::text from transactions t
  where (t.account_id = ${ACCOUNT_ID} or t.counter_account_id = ${ACCOUNT_ID})
    and t.deleted_at is null
)`;

export const lastObservation = sql<{ balance: string; observedOn: string } | null>`(
  select json_build_object('balance', o.balance::text, 'observedOn', o.observed_on::text)
  from balance_observations o
  where o.account_id = ${ACCOUNT_ID}
  order by o.observed_on desc, o.created_at desc
  limit 1
)`;
