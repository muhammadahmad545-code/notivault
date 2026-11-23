import { Appear, Badge, Button, Card, Chip, Header, IconButton, Screen, SectionTitle, Text, formatRelativeTime, toMessage, useTheme, useToast } from '@basalt/core';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AlarmClock from 'lucide-react-native/icons/alarm-clock';
import AppWindow from 'lucide-react-native/icons/app-window';
import Copy from 'lucide-react-native/icons/copy';
import KeyRound from 'lucide-react-native/icons/key-round';
import ListFilter from 'lucide-react-native/icons/list-filter';
import Star from 'lucide-react-native/icons/star';
import Trash2 from 'lucide-react-native/icons/trash';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import type { CapturedNotification } from '../../../modules/pulse-listener';
import { AppAvatar } from '../../components/NotificationRow';
import { Listener } from '../../lib/settings';
import { requestNotifications } from '../../lib/useSetup';

const REMOVED: Record<string, string> = {
  opened: 'You opened it',
  dismissed: 'You dismissed it',
  app: 'The app removed it (for example, a deleted message)',
  pulse: 'Notivault removed it from the shade',
  expired: 'It expired',
  other: 'It was removed',
};

function laterOptions(): { label: string; at: number }[] {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
  const evening = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0);
  const out = [
    { label: 'In 1 hour', at: Date.now() + 3_600_000 },
    { label: 'In 3 hours', at: Date.now() + 3 * 3_600_000 },
  ];
  if (evening.getTime() - Date.now() > 3_600_000) out.push({ label: 'This evening', at: evening.getTime() });
  out.push({ label: 'Tomorrow 9:00', at: tomorrow.getTime() });
  return out;
}

export default function Detail() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<CapturedNotification | null | undefined>(undefined);
  const [thread, setThread] = useState<CapturedNotification[]>([]);
  const [showLater, setShowLater] = useState(false);

  const load = useCallback(() => {
    Listener.byId(Number(id))
      .then(async (row) => {
        setItem(row);
        setThread(row && row.versions > 1 ? await Listener.versions(row.key) : []);
      })
      .catch(() => setItem(null));
  }, [id]);

  useEffect(load, [load]);

  const copy = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    toast(`${label} copied`, 'success');
  };

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

  const toggleStar = async () => {
    try {
      await Listener.setStarred(item.id, !item.starred);
      setItem({ ...item, starred: !item.starred });
      toast(item.starred ? 'Removed from starred' : 'Starred. Starred notifications are never deleted by retention.', 'success');
    } catch (error) {
      toast(toMessage(error), 'danger');
    }
  };

  const remind = async (at: number, label: string) => {
    if (!(await requestNotifications())) return toast('Allow notifications for Notivault to get reminders.', 'danger');
    try {
      await Listener.remindLater(item.id, at);
      setShowLater(false);
      toast(`I’ll remind you ${label.toLowerCase()}`, 'success');
    } catch (error) {
      toast(toMessage(error), 'danger');
    }
  };

  const remove = () =>
    Alert.alert('Delete this notification?', 'It is removed from Notivault only.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await Listener.deleteOne(item.id);
            router.back();
          } catch (error) {
            toast(toMessage(error), 'danger');
          }
        },
      },
    ]);

  return (
    <Screen aurora>
      <Header
        title={item.app}
        subtitle={new Date(item.postedAt).toLocaleString()}
        onBack={() => router.back()}
        right={
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <IconButton icon={Star} label={item.starred ? 'Unstar' : 'Star'} tone={item.starred ? 'accent' : 'text'} onPress={() => void toggleStar()} />
            <IconButton icon={Trash2} label="Delete" tone="danger" onPress={remove} />
          </View>
        }
      />
      <Appear index={0}>
        <Card variant="raised" style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <AppAvatar name={item.app} pkg={item.package} size={52} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="heading" selectable>
                {item.title || item.app}
              </Text>
              <Text variant="caption" color="textFaint" selectable>
                {item.package}
              </Text>
            </View>
          </View>
          <Text selectable style={{ fontSize: 16, lineHeight: 24 }}>
            {item.text}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {item.state === 'muted' ? <Badge label={`Quieted by “${item.ruleName}”`} tone="muted" /> : null}
            {item.state === 'digest' ? <Badge label={`Held for digest by “${item.ruleName}”`} tone="accent" /> : null}
            {item.removedAt ? <Badge label={`${REMOVED[item.removedBy ?? 'other']} · ${formatRelativeTime(item.removedAt)}`} tone={item.removedBy === 'app' ? 'warning' : 'muted'} /> : null}
          </View>
        </Card>
      </Appear>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label="Copy" icon={Copy} variant="secondary" onPress={() => copy(`${item.title}\n${item.text}`.trim(), 'Text')} style={{ flex: 1 }} />
        <Button label="Remind me" icon={AlarmClock} variant="secondary" onPress={() => setShowLater(!showLater)} style={{ flex: 1 }} />
      </View>
      {item.code ? <Button label={`Copy code ${item.code}`} icon={KeyRound} size="lg" onPress={() => copy(item.code!, 'Code')} /> : null}
      {showLater ? (
        <Card style={{ gap: spacing.sm }}>
          <Text variant="label" color="textMuted">
            Remind me about this
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {laterOptions().map((o) => (
              <Chip key={o.label} label={o.label} onPress={() => void remind(o.at, o.label)} />
            ))}
          </View>
        </Card>
      ) : null}

      {thread.length > 1 ? (
        <>
          <SectionTitle title={`Thread · ${thread.length}${thread.length === 100 ? '+' : ''}`} />
          <Text variant="caption" color="textMuted">
            Everything this app posted under the same notification: a chat’s messages, or the versions of an edited one.
          </Text>
          {thread.map((v) => (
            <Card key={v.id} style={{ gap: spacing.xs, borderColor: v.id === item.id ? colors.accent : colors.border }}>
              <Text variant="caption" color="textFaint">
                {new Date(v.postedAt).toLocaleString()}
                {v.removedBy === 'app' ? ' · removed by app' : ''}
              </Text>
              {v.title && v.title !== item.title ? <Text variant="bodyStrong">{v.title}</Text> : null}
              <Text selectable color="textMuted">
                {v.text}
              </Text>
            </Card>
          ))}
        </>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label={`About ${item.app}`} icon={AppWindow} variant="ghost" onPress={() => router.push({ pathname: '/app/[pkg]', params: { pkg: item.package, name: item.app } })} style={{ flex: 1 }} />
        <Button label="Make a rule" icon={ListFilter} variant="ghost" onPress={() => router.push({ pathname: '/rules/[id]', params: { id: 'new', pkg: item.package, app: item.app } })} style={{ flex: 1 }} />
      </View>
    </Screen>
  );
}
