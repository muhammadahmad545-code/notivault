import { Button, Card, EmptyState, Header, Screen, SectionTitle, Text, useTheme, useToast } from '@basalt/core';
import { useRouter } from 'expo-router';
import { Clock3, Send } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import type { CapturedNotification } from '../../modules/pulse-listener';
import { NotificationRow } from '../components/NotificationRow';
import { clock } from '../lib/time';
import { Listener, digestTimesSetting } from '../lib/settings';

export default function Digest() {
  const { spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<CapturedNotification[]>([]);
  const [times] = digestTimesSetting.use();

  useEffect(() => {
    Listener.query(null, null, 'digest', null, 300)
      .then((rows) => setItems(rows.filter((r) => r.postedAt > Date.now() - 24 * 60 * 60 * 1000)))
      .catch(() => toast('Could not load the digest.', 'danger'));
  }, [toast]);

  const groups = useMemo(() => {
    const map = new Map<string, CapturedNotification[]>();
    for (const item of items) map.set(item.app, [...(map.get(item.app) ?? []), item]);
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [items]);

  return (
    <Screen>
      <Header title="Digest" subtitle={times.length ? `Delivered at ${times.map(clock).join(', ')}` : 'No digest times set'} onBack={() => router.back()} />
      {groups.length === 0 ? (
        <EmptyState icon={Clock3} title="Nothing held back" message="Notifications caught by a “Hold for digest” rule in the last 24 hours collect here." />
      ) : (
        groups.map(([app, rows]) => (
          <View key={app} style={{ gap: spacing.xs }}>
            <SectionTitle title={`${app} · ${rows.length}`} />
            <Card padded={false}>
              {rows.slice(0, 20).map((row) => (
                <NotificationRow key={row.id} item={row} onPress={() => router.push({ pathname: '/n/[id]', params: { id: String(row.id) } })} />
              ))}
              {rows.length > 20 ? (
                <Text variant="caption" color="textMuted" style={{ padding: spacing.md }}>
                  and {rows.length - 20} more
                </Text>
              ) : null}
            </Card>
          </View>
        ))
      )}
      <Button
        label="Send digest notification now"
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
