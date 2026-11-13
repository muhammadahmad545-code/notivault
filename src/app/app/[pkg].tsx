import { Appear, Bars, Button, Card, Header, Screen, SectionTitle, StatTile, Text, useTheme, useToast } from '@basalt/core';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BellOff, Clock3, Siren } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { CapturedNotification, Stats } from '../../../modules/pulse-listener';
import { AppAvatar, NotificationRow } from '../../components/NotificationRow';
import type { RuleAction } from '../../lib/rules';
import { Listener, rulesSetting, syncNative } from '../../lib/settings';

/** One app at a glance: how often it interrupts, when, its recent notifications, and one-tap rules. */
export default function AppScreen() {
  const { spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { pkg, name } = useLocalSearchParams<{ pkg: string; name?: string }>();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<CapturedNotification[]>([]);
  const [rules, setRules] = rulesSetting.use();
  const appName = name ?? pkg;

  useEffect(() => {
    Listener.stats(Date.now() - 7 * 86_400_000, pkg).then(setStats).catch(() => {});
    Listener.query(null, pkg, null, null, null, 20).then(setRecent).catch(() => {});
  }, [pkg]);

  const days: { label: string; value: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push({ label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), value: stats?.perDay[key] ?? 0 });
  }
  const existing = rules.find((r) => r.apps.length === 1 && r.apps[0] === pkg && r.keywords.length === 0);

  const quickRule = (action: RuleAction) => {
    const names: Record<RuleAction, string> = { mute: `Quiet ${appName}`, digest: `${appName} in digest`, alert: `${appName} priority` };
    const rule = { id: existing?.id ?? Crypto.randomUUID(), name: names[action], enabled: true, apps: [pkg], keywords: [], action };
    setRules(existing ? rules.map((r) => (r.id === existing.id ? rule : r)) : [rule, ...rules]);
    const error = syncNative();
    toast(error ?? `${names[action]}: rule saved`, error ? 'danger' : 'success');
  };

  return (
    <Screen aurora>
      <Header title={appName} subtitle={pkg} onBack={() => router.back()} right={<AppAvatar name={appName} pkg={pkg} size={44} />} />
      {stats ? (
        <Appear index={0} style={{ flexDirection: 'row', gap: spacing.sm }}>
          <StatTile label="Last 7 days" value={String(stats.total)} detail={`${Math.round(stats.total / 7)} a day`} />
          <StatTile label="Quieted" value={String(stats.quieted)} />
          <StatTile label="Peak hour" value={`${String(stats.perHour.indexOf(Math.max(...stats.perHour))).padStart(2, '0')}:00`} />
        </Appear>
      ) : null}
      <Card variant="raised" style={{ gap: spacing.md }}>
        <Text variant="label" color="textMuted">
          Notifications per day
        </Text>
        <Bars values={days.map((d) => d.value)} labels={days.map((d) => d.label)} highlight={6} accessibilityLabel={`${appName} notifications over the last 7 days`} />
      </Card>
      <SectionTitle title={existing ? `Current rule: ${existing.name}` : 'Quick rule'} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label="Quiet" icon={BellOff} variant={existing?.action === 'mute' ? 'primary' : 'secondary'} onPress={() => quickRule('mute')} style={{ flex: 1 }} />
        <Button label="Digest" icon={Clock3} variant={existing?.action === 'digest' ? 'primary' : 'secondary'} onPress={() => quickRule('digest')} style={{ flex: 1 }} />
        <Button label="Priority" icon={Siren} variant={existing?.action === 'alert' ? 'primary' : 'secondary'} onPress={() => quickRule('alert')} style={{ flex: 1 }} />
      </View>
      <SectionTitle title="Recent" />
      <Card padded={false}>
        {recent.map((row) => (
          <NotificationRow key={row.id} item={row} onPress={() => router.push({ pathname: '/n/[id]', params: { id: String(row.id) } })} />
        ))}
      </Card>
    </Screen>
  );
}
