import { Card, EmptyState, Header, Screen, SectionTitle, SegmentedControl, StatTile, Text, useTheme } from '@basalt/core';
import { useRouter } from 'expo-router';
import { BarChart3 } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { Stats } from '../../modules/pulse-listener';
import { AppAvatar } from '../components/NotificationRow';
import { Listener } from '../lib/settings';

const RANGES = [
  { value: '1', label: 'Today' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
] as const;

export default function Insights() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const [range, setRange] = useState<'1' | '7' | '30'>('7');
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const now = new Date();
    const since = range === '1' ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() : Date.now() - Number(range) * 86_400_000;
    setStats(null);
    Listener.stats(since)
      .then((s) => {
        setStats(s);
        setError(false);
      })
      .catch(() => setError(true));
  }, [range]);

  const days = Number(range);
  const maxApp = stats?.perApp[0]?.count ?? 1;
  const maxHour = Math.max(1, ...(stats?.perHour ?? [0]));
  const busiest = stats ? stats.perHour.indexOf(Math.max(...stats.perHour)) : 0;

  return (
    <Screen>
      <Header title="Insights" subtitle="Who interrupts you, and when" onBack={() => router.back()} />
      <SegmentedControl options={RANGES} value={range} onChange={setRange} />
      {error ? <Text color="danger">Could not load statistics.</Text> : null}
      {!stats && !error ? <ActivityIndicator color={colors.accent} /> : null}
      {stats && stats.total === 0 ? <EmptyState icon={BarChart3} title="No data yet" message="Insights fill in as Pulse captures notifications." /> : null}
      {stats && stats.total > 0 ? (
        <>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile label="Notifications" value={String(stats.total)} detail={days > 1 ? `${Math.round(stats.total / days)} a day` : 'today'} />
            <StatTile label="Quieted" value={`${Math.round((stats.quieted / stats.total) * 100)}%`} detail={`${stats.quieted} by rules`} />
            <StatTile label="Busiest hour" value={`${String(busiest).padStart(2, '0')}:00`} />
          </View>

          <SectionTitle title="Top apps" />
          <Card style={{ gap: spacing.md }}>
            {stats.perApp.map((a) => (
              <View key={a.package} accessible accessibilityLabel={`${a.app}: ${a.count}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <AppAvatar name={a.app} pkg={a.package} size={32} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>
                      {a.app}
                    </Text>
                    <Text variant="label" color="textMuted" style={{ fontVariant: ['tabular-nums'] }}>
                      {a.count}
                    </Text>
                  </View>
                  <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.border }}>
                    <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.accent, width: `${(a.count / maxApp) * 100}%` }} />
                  </View>
                </View>
              </View>
            ))}
          </Card>

          <SectionTitle title="By hour of day" />
          <Card style={{ gap: spacing.sm }}>
            <View accessible accessibilityLabel={`Most notifications arrive around ${busiest}:00`} style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 2 }}>
              {stats.perHour.map((count, hour) => (
                <View key={hour} style={{ flex: 1, height: `${Math.max(2, (count / maxHour) * 100)}%`, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: hour === busiest ? colors.accent : colors.accentSoft }} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {['00', '06', '12', '18', '23'].map((h) => (
                <Text key={h} variant="caption" color="textFaint">
                  {h}
                </Text>
              ))}
            </View>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
