import { Appear, Button, Card, EmptyState, Hero, Screen, SectionTitle, TAB_BAR_SPACE, Text, useTheme, useToast } from '@basalt/core';
import { useFocusEffect, useRouter } from 'expo-router';
import Clock3 from 'lucide-react-native/icons/clock-3';
import Send from 'lucide-react-native/icons/send';
import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import type { CapturedNotification } from '../../../modules/pulse-listener';
import { AppAvatar, NotificationRow } from '../../components/NotificationRow';
import { Listener, digestTimesSetting } from '../../lib/settings';
import { clock } from '../../lib/time';

export default function Digest() {
  const { spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<CapturedNotification[] | null>(null);
  const [times] = digestTimesSetting.use();

  useFocusEffect(
    useCallback(() => {
      Listener.query(null, null, 'digest', null, null, 400)
        .then((rows) => setItems(rows.filter((r) => r.postedAt > Date.now() - 24 * 60 * 60 * 1000)))
        .catch(() => setItems([]));
    }, []),
  );

  const groups = useMemo(() => {
    const map = new Map<string, CapturedNotification[]>();
    for (const item of items ?? []) map.set(item.package, [...(map.get(item.package) ?? []), item]);
    return [...map.values()].sort((a, b) => b.length - a.length);
  }, [items]);

  const next = useMemo(() => {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const upcoming = [...times].sort((a, b) => a - b).find((t) => t > minutes) ?? [...times].sort((a, b) => a - b)[0];
    return upcoming === undefined ? null : clock(upcoming);
  }, [times]);

  return (
    <Screen aurora bottomSpace={TAB_BAR_SPACE}>
      <Hero overline="Pulse" title="Digest" subtitle={next ? `Next digest at ${next}. Held notifications from the last 24 hours.` : 'No digest times set. Add some in Settings.'} />
      {items && groups.length === 0 ? (
        <EmptyState icon={Clock3} title="Nothing held back" message="Make a “Hold for digest” rule for chatty apps, and their notifications collect here instead of interrupting you." />
      ) : null}
      {groups.map((rows, i) => (
        <Appear key={rows[0].package} index={i} style={{ gap: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <AppAvatar name={rows[0].app} pkg={rows[0].package} size={28} />
            <SectionTitle title={`${rows[0].app} · ${rows.length}`} />
          </View>
          <Card padded={false}>
            {rows.slice(0, 15).map((row) => (
              <NotificationRow key={row.id} item={row} onPress={() => router.push({ pathname: '/n/[id]', params: { id: String(row.id) } })} />
            ))}
            {rows.length > 15 ? (
              <Text variant="caption" color="textMuted" style={{ padding: spacing.md }}>
                and {rows.length - 15} more
              </Text>
            ) : null}
          </Card>
        </Appear>
      ))}
      <Button
        label="Send the digest notification now"
        icon={Send}
        variant="secondary"
        onPress={() => {
          try {
            Listener.sendDigestNow();
            toast('Digest sent', 'success');
          } catch {
            toast('Could not send the digest.', 'danger');
          }
        }}
      />
    </Screen>
  );
}
