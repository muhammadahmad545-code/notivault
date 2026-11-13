import { Button, Card, Header, IconButton, Screen, SectionTitle, Text, formatRelativeTime, toMessage, useTheme, useToast } from '@basalt/core';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Copy, KeyRound, ListFilter, Trash2 } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import type { CapturedNotification } from '../../../modules/pulse-listener';
import { AppAvatar } from '../../components/NotificationRow';
import { Listener } from '../../lib/settings';

const REMOVED: Record<string, string> = {
  opened: 'You opened it',
  dismissed: 'You dismissed it',
  app: 'The app removed it (for example, a deleted message)',
  pulse: 'Pulse removed it from the shade',
  expired: 'It expired',
  other: 'It was removed',
};

export default function Detail() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<CapturedNotification | null | undefined>(undefined);
  const [versions, setVersions] = useState<CapturedNotification[]>([]);

  useEffect(() => {
    Listener.byId(Number(id))
      .then(async (row) => {
        setItem(row);
        if (row && row.versions > 1) setVersions(await Listener.versions(row.key));
      })
      .catch(() => setItem(null));
  }, [id]);

  const copy = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    toast(`${label} copied`, 'success');
  };

  const remove = () =>
    Alert.alert('Delete this notification?', 'It is removed from Pulse only.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await Listener.deleteOne(Number(id));
            router.back();
          } catch (error) {
            toast(toMessage(error), 'danger');
          }
        },
      },
    ]);

  if (item === undefined) {
    return (
      <Screen>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  if (item === null) {
    return (
      <Screen>
        <Header title="Not found" onBack={() => router.back()} />
        <Text color="textMuted">This notification was deleted or has expired from your history.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title={item.app} subtitle={new Date(item.postedAt).toLocaleString()} onBack={() => router.back()} right={<IconButton icon={Trash2} label="Delete" tone="danger" onPress={remove} />} />
      <Card style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <AppAvatar name={item.app} pkg={item.package} size={48} />
          <View style={{ flex: 1 }}>
            <Text variant="heading" selectable>
              {item.title || item.app}
            </Text>
            <Text variant="caption" color="textFaint" selectable>
              {item.package}
            </Text>
          </View>
        </View>
        <Text selectable>{item.text}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button label="Copy text" icon={Copy} variant="secondary" onPress={() => copy(`${item.title}\n${item.text}`.trim(), 'Text')} style={{ flex: 1 }} />
          {item.code ? <Button label={`Copy ${item.code}`} icon={KeyRound} onPress={() => copy(item.code!, 'Code')} style={{ flex: 1 }} /> : null}
        </View>
      </Card>

      <Card style={{ gap: spacing.xs }}>
        <Text variant="caption" color="textMuted">
          {item.state === 'muted' ? `Quieted by rule “${item.ruleName}”` : item.state === 'digest' ? `Held for digest by rule “${item.ruleName}”` : 'Shown normally'}
        </Text>
        {item.removedAt ? (
          <Text variant="caption" color={item.removedBy === 'app' ? 'warning' : 'textMuted'}>
            {REMOVED[item.removedBy ?? 'other']} · {formatRelativeTime(item.removedAt)}
          </Text>
        ) : null}
        {item.category ? (
          <Text variant="caption" color="textFaint">
            Category: {item.category}
          </Text>
        ) : null}
      </Card>

      {versions.length > 1 ? (
        <>
          <SectionTitle title={`History · ${versions.length} versions`} />
          <Text variant="caption" color="textMuted">
            Apps update a notification as a conversation grows or when a message is edited or deleted. Pulse keeps every version.
          </Text>
          {versions.map((v, i) => (
            <Card key={v.id} style={{ gap: spacing.xs, borderColor: v.id === item.id ? colors.accent : colors.border }}>
              <Text variant="caption" color="textFaint">
                Version {i + 1} · {new Date(v.postedAt).toLocaleTimeString()}
              </Text>
              {v.title ? <Text variant="bodyStrong">{v.title}</Text> : null}
              <Text selectable color="textMuted">
                {v.text}
              </Text>
            </Card>
          ))}
        </>
      ) : null}

      <Button
        label={`Make a rule for ${item.app}`}
        icon={ListFilter}
        variant="ghost"
        onPress={() => router.push({ pathname: '/rules/[id]', params: { id: 'new', pkg: item.package, app: item.app } })}
      />
    </Screen>
  );
}
