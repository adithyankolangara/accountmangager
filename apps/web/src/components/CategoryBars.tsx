import { useState } from 'react';
import { formatMoney, Money } from '@smartfin/shared';

export interface BarDatum {
  key: string;
  label: string;
  value: string;
  count: number;
}

/**
 * Single-series horizontal bars: one hue, no legend (the card title names the series), value at
 * each bar tip, and a hover/focus tooltip with share and count. Every value is also in the
 * Reports table, so the tooltip only adds detail.
 */
export function CategoryBars({ data, maxBars = 6 }: { data: BarDatum[]; maxBars?: number }) {
  const [active, setActive] = useState<string | null>(null);
  const positive = data.filter((d) => new Money(d.value).gt(0));
  const shown = positive.slice(0, maxBars);
  const rest = positive.slice(maxBars);
  if (rest.length > 0) {
    shown.push({
      key: 'other',
      label: `Other (${rest.length})`,
      value: rest.reduce((sum, d) => sum.plus(d.value), new Money(0)).toFixed(2),
      count: rest.reduce((sum, d) => sum + d.count, 0),
    });
  }
  const total = positive.reduce((sum, d) => sum.plus(d.value), new Money(0));
  const max = shown.reduce((m, d) => Money.max(m, d.value), new Money(0));

  return (
    <ul className="bars">
      {shown.map((d) => {
        const share = total.gt(0) ? new Money(d.value).div(total).times(100).toFixed(0) : '0';
        const width = max.gt(0) ? new Money(d.value).div(max).times(100).toNumber() : 0;
        const description = `${d.label}: ${formatMoney(d.value)}, ${share}% of spending, ${d.count} transaction${d.count === 1 ? '' : 's'}`;
        return (
          <li
            key={d.key}
            className="bar-row"
            tabIndex={0}
            aria-label={description}
            onPointerEnter={() => setActive(d.key)}
            onPointerLeave={() => setActive((a) => (a === d.key ? null : a))}
            onFocus={() => setActive(d.key)}
            onBlur={() => setActive((a) => (a === d.key ? null : a))}
          >
            <span className="bar-label" aria-hidden="true">
              {d.label}
            </span>
            <span className="bar-track" aria-hidden="true">
              {/* The plot area leaves room after the longest bar for its value label. */}
              <span className="bar-area">
                <span className="bar-fill" style={{ width: `${width}%` }} />
                <span className="bar-value">{formatMoney(d.value)}</span>
              </span>
              {active === d.key ? (
                <span className="bar-tooltip">
                  <strong>{formatMoney(d.value)}</strong>
                  <span>
                    {d.label} · {share}% of spending · {d.count} transaction
                    {d.count === 1 ? '' : 's'}
                  </span>
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
