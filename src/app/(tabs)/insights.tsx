import { Appear, Bars, Card, EmptyState, Hero, Pressable, Ring, Screen, SectionTitle, SegmentedControl, StatTile, TAB_BAR_SPACE, Text, useTheme } from '@basalt/core';
import { useFocusEffect, useRouter } from 'expo-router';
import BarChart3 from 'lucide-react-native/icons/chart-column';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { Stats } from '../../../modules/pulse-listener';
import { AppAvatar } from '../../components/NotificationRow';
import { Listener } from '../../lib/settings';

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

  useFocusEffect(
    useCallback(() => {
      const now = new Date();
      const since = range === '1' ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() : Date.now() - Number(range) * 86_400_000;
      setStats(null);
      Listener.stats(since, null)
        .then(setStats)
        .catch(() => setStats({ total: 0, quieted: 0, codes: 0, perApp: [], perHour: Array(24).fill(0), perDay: {} }));
    }, [range]),
  );

  const days = Number(range);
  const maxApp = stats?.perApp[0]?.count ?? 1;
  const busiest = stats ? stats.perHour.indexOf(Math.max(...stats.perHour)) : 0;

  return (
    <Screen aurora bottomSpace={TAB_BAR_SPACE}>
      <Hero overline="Pulse" title="Insights" subtitle="Who interrupts you, and when." />
      <SegmentedControl options={RANGES} value={range} onChange={setRange} />
      {!stats ? <ActivityIndicator color={colors.accent} /> : null}
      {stats && stats.total === 0 ? <EmptyState icon={BarChart3} title="No data yet" message="Insights fill in as Pulse captures notifications." /> : null}
      {stats && stats.total > 0 ? (
        <>
          <Appear index={0}>
            <Card variant="raised" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
              <Ring progress={stats.quieted / stats.total} size={104} stroke={11}>
                <Text variant="title">{Math.round((stats.quieted / stats.total) * 100)}%</Text>
              </Ring>
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="heading">Quieted by your rules</Text>
                <Text variant="caption" color="textMuted">
                  {stats.quieted} of {stats.total} notifications never interrupted you.
                </Text>
              </View>
            </Card>
          </Appear>
          <Appear index={1} style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile label="Notifications" value={String(stats.total)} detail={days > 1 ? `${Math.round(stats.total / days)} a day` : 'today'} />
            <StatTile label="Codes" value={String(stats.codes)} />
            <StatTile label="Busiest" value={`${String(busiest).padStart(2, '0')}:00`} />
          </Appear>
          <SectionTitle title="By hour of day" />
          <Appear index={2}>
            <Card>
              <Bars values={stats.perHour} labels={['00', '06', '12', '18', '23']} highlight={busiest} accessibilityLabel={`Most notifications arrive around ${busiest}:00`} />
            </Card>
          </Appear>
          <SectionTitle title="Top apps" />
          <Card style={{ gap: spacing.md }}>
            {stats.perApp.map((a) => (
              <Pressable
                key={a.package}
                accessibilityRole="button"
                accessibilityLabel={`${a.app}: ${a.count}. Open app details`}
                pressScale={0.98}
                onPress={() => router.push({ pathname: '/app/[pkg]', params: { pkg: a.package, name: a.app } })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
              >
                <AppAvatar name={a.app} pkg={a.package} size={34} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>
                      {a.app}
                    </Text>
                    <Text variant="label" color="textMuted">
                      {a.count}
                    </Text>
                  </View>
                  <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.border }}>
                    <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.accent, width: `${(a.count / maxApp) * 100}%` }} />
                  </View>
                </View>
                <ChevronRight size={16} color={colors.textFaint} />
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
