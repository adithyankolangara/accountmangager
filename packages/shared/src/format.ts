import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from './constants';
import { toMoneyString, type MoneyInput } from './money';

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: string, locale: string): Intl.NumberFormat {
  const key = `${locale}|${currency}`;
  let formatter = currencyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    currencyFormatters.set(key, formatter);
  }
  return formatter;
}

/**
 * Formats an amount with Indian digit grouping by default: "₹1,23,456.78".
 * The value is passed to Intl as a decimal string, so it is never converted to a float.
 */
export function formatMoney(
  amount: MoneyInput,
  currency: string = DEFAULT_CURRENCY,
  locale: string = DEFAULT_LOCALE,
): string {
  return currencyFormatter(currency, locale).format(toMoneyString(amount) as `${number}`);
}

/** Masks an account, card or folio reference down to its last four characters: "•••• 1234". */
export function maskReference(reference: string): string {
  const visible = reference.replace(/\s+/g, '').slice(-4);
  return visible ? `•••• ${visible}` : '';
}
