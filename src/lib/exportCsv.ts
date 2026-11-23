import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { CapturedNotification } from '../../modules/pulse-listener';
import { csvCell, parseMoney } from './money';
import { Listener } from './settings';

/** Read every notification posted since `since`, newest first, in pages. Stops at `cap` rows. */
export async function readSince(since: number, cap = 5000): Promise<CapturedNotification[]> {
  const out: CapturedNotification[] = [];
  let beforeAt: number | null = null;
  let beforeId: number | null = null;
  while (out.length < cap) {
    const page = await Listener.query(null, null, null, beforeAt, beforeId, 500);
    if (page.length === 0) break;
    for (const row of page) {
      if (row.postedAt < since) return out;
      out.push(row);
    }
    const last = page[page.length - 1];
    beforeAt = last.postedAt;
    beforeId = last.id;
    if (page.length < 500) break;
  }
  return out;
}

const iso = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

async function share(name: string, lines: string[]): Promise<void> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(lines.join('\r\n'));
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: name, UTI: 'public.comma-separated-values-text' });
}

/** History as CSV. One-time codes are left out on purpose. */
export async function exportHistory(days: number): Promise<number> {
  const rows = await readSince(Date.now() - days * 86_400_000, 20000);
  const lines = ['time,app,title,text,state,rule,removed_by'];
  for (const r of rows) lines.push([iso(r.postedAt), r.app, r.title, r.text, r.state, r.ruleName, r.removedBy].map(csvCell).join(','));
  await share(`notivault-history-${new Date().toISOString().slice(0, 10)}.csv`, lines);
  return rows.length;
}

export interface MoneyRow {
  notification: CapturedNotification;
  amount: number;
  currency: string;
  direction: 'out' | 'in';
  counterparty: string | null;
}

/** Bank and wallet transactions found in notifications since `since`. */
export async function moneySince(since: number): Promise<MoneyRow[]> {
  const rows = await readSince(since);
  const seen = new Set<string>();
  const out: MoneyRow[] = [];
  for (const n of rows) {
    const m = parseMoney(n.title, n.text);
    if (!m) continue;
    // An app that edits the same alert (or posts it twice) must not count it twice.
    const dedupe = `${n.key}|${m.amount}|${m.direction}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ notification: n, ...m });
  }
  return out;
}

export async function exportMoney(rows: MoneyRow[], label: string): Promise<void> {
  const lines = ['time,app,direction,amount,currency,counterparty,text'];
  for (const r of rows) {
    lines.push([iso(r.notification.postedAt), r.notification.app, r.direction === 'out' ? 'spent' : 'received', r.amount, r.currency, r.counterparty, r.notification.text].map(csvCell).join(','));
  }
  await share(`notivault-money-${label}.csv`, lines);
}
