import { Button, Card, EmptyState, Header, ListItem, Screen, SectionTitle, SegmentedControl, StatTile, Text, toMessage, useTheme, useToast } from '@basalt/core';
import { useLock } from '@basalt/core/src/lock/LockGate';
import { useRouter } from 'expo-router';
import ArrowDownLeft from 'lucide-react-native/icons/arrow-down-left';
import ArrowUpRight from 'lucide-react-native/icons/arrow-up-right';
import FileSpreadsheet from 'lucide-react-native/icons/file-spreadsheet';
import Wallet from 'lucide-react-native/icons/wallet';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { exportMoney, moneySince, type MoneyRow } from '../lib/exportCsv';
import { formatMoney } from '../lib/money';

const RANGES = [
  { value: 'this', label: 'This month' },
  { value: 'last', label: 'Last month' },
  { value: '90', label: '90 days' },
] as const;
type Range = (typeof RANGES)[number]['value'];

function bounds(range: Range): { from: number; to: number; label: string } {
  const now = new Date();
  if (range === 'this') return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to: Date.now(), label: now.toISOString().slice(0, 7) };
  if (range === 'last') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { from: start.getTime(), to: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), label: start.toISOString().slice(0, 7) };
  }
  return { from: Date.now() - 90 * 86_400_000, to: Date.now(), label: '90-days' };
}

/** Totals per currency, so Rs and $ are never added together. */
function totals(rows: MoneyRow[], direction: 'out' | 'in'): string {
  const sums = new Map<string, number>();
  for (const r of rows) if (r.direction === direction) sums.set(r.currency, (sums.get(r.currency) ?? 0) + r.amount);
  if (sums.size === 0) return '0';
  return [...sums.entries()].map(([c, v]) => formatMoney(Math.round(v * 100) / 100, c)).join(' · ');
}

/**
 * Money from your bank and wallet alerts: spending and income read from the notifications
 * Notivault already keeps. Nothing leaves the phone and no SMS or bank access is needed.
 */
export default function Money() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const lock = useLock();
  const [range, setRange] = useState<Range>('this');
  const [rows, setRows] = useState<MoneyRow[] | null>(null);
  const window = useMemo(() => bounds(range), [range]);

  useEffect(() => {
    let alive = true;
    setRows(null);
    moneySince(window.from)
      .then((all) => alive && setRows(all.filter((r) => r.notification.postedAt < window.to)))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [window]);

  const byApp = useMemo(() => {
    const map = new Map<string, { app: string; count: number }>();
    for (const r of rows ?? []) {
      const cur = map.get(r.notification.package) ?? { app: r.notification.app, count: 0 };
      cur.count += 1;
      map.set(r.notification.package, cur);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [rows]);

  const doExport = async () => {
    if (!rows?.length) return;
    try {
      await lock.runExternal(() => exportMoney(rows, window.label));
    } catch (error) {
      toast(toMessage(error, 'Could not export.'), 'danger');
    }
  };

  return (
    <Screen>
      <Header title="Money" subtitle="Read from your bank and wallet alerts" onBack={() => router.back()} />
      <SegmentedControl options={RANGES} value={range} onChange={setRange} />
      {!rows ? <ActivityIndicator color={colors.accent} /> : null}
      {rows && rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No transactions found"
          message="When your bank or wallet app (Meezan, HBL, JazzCash, Easypaisa, cards…) notifies a payment, it shows up here."
        />
      ) : null}
      {rows && rows.length > 0 ? (
        <>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile label="Spent" value={totals(rows, 'out')} />
            <StatTile label="Received" value={totals(rows, 'in')} />
          </View>
          <Text variant="caption" color="textMuted">
            {rows.length} transaction{rows.length === 1 ? '' : 's'} from {byApp.map((a) => a.app).join(', ')}. Only alerts that clearly say debited, spent, sent, credited or received are counted.
          </Text>
          <Button label="Export as CSV" icon={FileSpreadsheet} variant="secondary" onPress={() => void doExport()} />
          <SectionTitle title="Transactions" />
          <Card padded={false}>
            {rows.slice(0, 200).map((r) => (
              <View key={r.notification.id} style={{ paddingHorizontal: spacing.lg }}>
                <ListItem
                  title={`${r.direction === 'out' ? '−' : '+'}${formatMoney(r.amount, r.currency)}${r.counterparty ? ` · ${r.counterparty}` : ''}`}
                  subtitle={`${r.notification.app} · ${new Date(r.notification.postedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                  icon={r.direction === 'out' ? ArrowUpRight : ArrowDownLeft}
                  iconTone={r.direction === 'out' ? 'danger' : 'success'}
                  chevron
                  onPress={() => router.push({ pathname: '/n/[id]', params: { id: String(r.notification.id) } })}
                />
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
