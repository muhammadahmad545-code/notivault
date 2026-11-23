/**
 * Spots bank and wallet transaction alerts ("PKR 1,500.00 debited from your A/C…", "You have
 * received Rs. 2,000 from Ali") and reads the amount, direction and counterparty. Runs on the
 * phone over notifications Notivault already keeps; nothing is uploaded.
 *
 * Deliberately conservative: a notification needs both an amount with a currency and a clear
 * debit or credit word, and promotions ("up to Rs 500 off") and one-time-code messages are skipped.
 */
export type MoneyDirection = 'out' | 'in';

export interface MoneyEvent {
  amount: number;
  currency: string;
  direction: MoneyDirection;
  counterparty: string | null;
}

const CURRENCY = '(rs\\.?|pkr|inr|usd|aed|sar|eur|gbp|\\$|₹|€|£)';
const NUMBER = '([0-9]{1,3}(?:,[0-9]{2,3})+(?:\\.[0-9]{1,2})?|[0-9]+(?:\\.[0-9]{1,2})?)';
const BEFORE = new RegExp(`${CURRENCY}\\s*${NUMBER}`, 'i');
const AFTER = new RegExp(`${NUMBER}\\s*${CURRENCY}(?![a-z])`, 'i');

const OUT = /\b(debited|debit|spent|paid|payment of|purchase|purchased|withdrawn|withdrawal|sent|transferred to|charged|deducted)\b/i;
const IN = /\b(credited|credit of|received|deposited|deposit of|refund(?:ed)?|cash ?back|transferred from)\b/i;
const PROMO = /\b(up ?to|% ?off|discount|sale|offer|win|cashback offer|voucher|coupon|deal)\b/i;
const OTP = /\b(otp|one[- ]time|verification code|passcode)\b/i;
const NOT_DONE = /\b(due|bill of|will be|request(?:ed)?|failed|declined|unsuccessful|reversed)\b/i;

const CURRENCY_NAMES: Record<string, string> = { rs: 'Rs', 'rs.': 'Rs', pkr: 'Rs', inr: '₹', '₹': '₹', usd: '$', $: '$', aed: 'AED', sar: 'SAR', eur: '€', '€': '€', gbp: '£', '£': '£' };

function counterparty(text: string, direction: MoneyDirection): string | null {
  const pattern = direction === 'out' ? /\b(?:to|at)\s+([A-Za-z][\w .&'-]{1,40}?)(?=\s+(?:on|via|ref|from|using|at|with|for|\d)|[.,;\n]|$)/ : /\bfrom\s+([A-Za-z][\w .&'-]{1,40}?)(?=\s+(?:on|via|ref|to|in|into|at|\d)|[.,;\n]|$)/;
  const m = pattern.exec(text);
  if (!m) return null;
  const name = m[1].trim();
  if (/^(your|a\/c|account|ac|card|wallet|bank)\b/i.test(name)) return null;
  return name.slice(0, 40);
}

export function parseMoney(title: string, text: string): MoneyEvent | null {
  const body = `${title}\n${text}`;
  if (OTP.test(body) || PROMO.test(body) || NOT_DONE.test(body)) return null;
  const out = OUT.exec(body);
  const inn = IN.exec(body);
  if (!out && !inn) return null;
  // When both appear ("debited … transferred from"), the earlier word describes this account.
  const direction: MoneyDirection = out && (!inn || out.index <= inn.index) ? 'out' : 'in';
  const before = BEFORE.exec(body);
  const after = AFTER.exec(body);
  const pick = before && (!after || before.index <= after.index) ? { cur: before[1], num: before[2] } : after ? { cur: after[2], num: after[1] } : null;
  if (!pick) return null;
  const amount = Number(pick.num.replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return {
    amount,
    currency: CURRENCY_NAMES[pick.cur.toLowerCase()] ?? pick.cur.toUpperCase(),
    direction,
    counterparty: counterparty(text || title, direction),
  };
}

export function formatMoney(amount: number, currency: string): string {
  const fixed = amount % 1 === 0 ? amount.toLocaleString('en-US') : amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency.length === 1 ? `${currency}${fixed}` : `${currency} ${fixed}`;
}

/** Quote a value for CSV (RFC 4180). */
export function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
