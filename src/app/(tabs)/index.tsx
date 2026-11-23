import { Appear, Aurora, Button, Card, Chip, EmptyState, Hero, IconButton, Pressable, Skeleton, StatTile, TAB_BAR_SPACE, Text, UpdateCard, toMessage, useTheme, useToast, useUpdater } from '@basalt/core';
import { useFocusEffect, useRouter } from 'expo-router';
import BellRing from 'lucide-react-native/icons/bell-ring';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import CircleDashed from 'lucide-react-native/icons/circle-dashed';
import ListFilter from 'lucide-react-native/icons/list-filter';
import Search from 'lucide-react-native/icons/search';
import X from 'lucide-react-native/icons/x';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppSummary, CapturedNotification, Stats } from '../../../modules/pulse-listener';
import { NotificationRow } from '../../components/NotificationRow';
import { Listener, UPDATE_SOURCE } from '../../lib/settings';
import { requestNotifications, useSetup } from '../../lib/useSetup';

const PAGE = 60;
type Filter = { kind: 'all' } | { kind: 'state'; state: 'muted' | 'digest' | 'starred' } | { kind: 'app'; pkg: string };
type Row = { type: 'day'; key: string; label: string } | { type: 'item'; key: string; item: CapturedNotification };

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}

function SetupCard() {
  const { colors, spacing } = useTheme();
  const [setup, reload] = useSetup();
  if (setup.listener && setup.notifications) return null;
  const step = (done: boolean, title: string, detail: string, action: string, onPress: () => void) => (
    <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
      {done ? <CircleCheck size={22} color={colors.success} /> : <CircleDashed size={22} color={colors.warning} />}
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" color="textMuted">
          {detail}
        </Text>
        {!done ? <Button label={action} variant="secondary" onPress={onPress} /> : null}
      </View>
    </View>
  );
  return (
    <Card variant="glow" style={{ gap: spacing.lg }}>
      <Text variant="heading">Finish setting up</Text>
      {step(setup.listener, 'Notification access', 'Lets Notivault read notifications. If Android says “Restricted setting”, open App info, tap ⋮ and choose Allow restricted settings, then try again.', 'Open notification access', () => Listener.openListenerSettings())}
      {step(setup.notifications, 'Notivault’s own notifications', 'Needed for code Copy buttons, priority alerts, digests and reminders.', 'Allow notifications', () => {
        void requestNotifications().then(reload);
      })}
    </Card>
  );
}

export default function Inbox() {
  const { colors, spacing, radius, typography } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const updater = useUpdater({ source: UPDATE_SOURCE });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [items, setItems] = useState<CapturedNotification[]>([]);
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [today, setToday] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(true);
  const request = useRef(0);

  const load = useCallback(
    async (append: boolean, last: CapturedNotification | null) => {
      const id = ++request.current;
      try {
        const rows = await Listener.query(
          search.trim() || null,
          filter.kind === 'app' ? filter.pkg : null,
          filter.kind === 'state' ? filter.state : null,
          last ? last.postedAt : null,
          last ? last.id : null,
          PAGE,
        );
        if (id !== request.current) return;
        setItems((current) => (append ? [...current, ...rows] : rows));
        setMore(rows.length === PAGE);
      } catch (error) {
        if (id === request.current) toast(toMessage(error, 'Could not read your notifications.'), 'danger');
      } finally {
        if (id === request.current) setLoading(false);
      }
    },
    [search, filter, toast],
  );

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => void load(false, null), search ? 220 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const refreshSummary = useCallback(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    Listener.apps().then(setApps).catch(() => {});
    Listener.stats(start.getTime(), null).then(setToday).catch(() => {});
  }, []);

  // Returning from a notification (starred, deleted) or a rule change shows the current list.
  useFocusEffect(
    useCallback(() => {
      refreshSummary();
      void load(false, null);
    }, [refreshSummary, load]),
  );

  useEffect(() => {
    const sub = Listener.addListener('onNotification', (row) => {
      if (search || filter.kind !== 'all') return;
      setItems((current) => (current.some((r) => r.id === row.id) ? current : [row, ...current]));
      setToday((t) => (t ? { ...t, total: t.total + 1, quieted: t.quieted + (row.state !== 'shown' ? 1 : 0), codes: t.codes + (row.code ? 1 : 0) } : t));
    });
    return () => sub.remove();
  }, [search, filter]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    let current = '';
    for (const item of items) {
      const label = dayLabel(item.postedAt);
      if (label !== current) {
        current = label;
        out.push({ type: 'day', key: `day-${label}-${item.id}`, label });
      }
      out.push({ type: 'item', key: String(item.id), item });
    }
    return out;
  }, [items]);

  const header = (
    <View style={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.lg, gap: spacing.lg, paddingBottom: spacing.sm }}>
      <Hero overline="Basalt" title="Notivault" right={<IconButton icon={ListFilter} label="Rules" onPress={() => router.push('/rules')} />}>
        {today ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile label="Today" value={String(today.total)} />
            <StatTile label="Quieted" value={String(today.quieted)} />
            <StatTile label="Codes" value={String(today.codes)} />
          </View>
        ) : (
          <Skeleton height={76} radius={16} />
        )}
      </Hero>
      <UpdateCard updater={updater} />
      <SetupCard />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md }}>
        <Search size={18} color={colors.textFaint} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search every notification"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="Search notifications"
          autoCorrect={false}
          returnKeyType="search"
          style={[typography.body, { flex: 1, color: colors.text, paddingVertical: spacing.md }]}
        />
        {search ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={12} onPress={() => setSearch('')}>
            <X size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        <Chip label="All" selected={filter.kind === 'all'} onPress={() => setFilter({ kind: 'all' })} />
        {(['starred', 'muted', 'digest'] as const).map((state) => (
          <Chip
            key={state}
            label={state === 'starred' ? 'Starred' : state === 'muted' ? 'Quieted' : 'Digest'}
            selected={filter.kind === 'state' && filter.state === state}
            onPress={() => setFilter({ kind: 'state', state })}
          />
        ))}
        {apps.slice(0, 12).map((a) => (
          <Chip key={a.package} label={`${a.app} · ${a.count}`} selected={filter.kind === 'app' && filter.pkg === a.package} onPress={() => setFilter({ kind: 'app', pkg: a.package })} />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Aurora />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        ListHeaderComponent={header}
        renderItem={({ item: row, index }) =>
          row.type === 'day' ? (
            <Text variant="overline" color="textMuted" style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xs }}>
              {row.label}
            </Text>
          ) : index < 16 ? (
            <Appear index={index}>
              <NotificationRow item={row.item} onPress={() => router.push({ pathname: '/n/[id]', params: { id: String(row.item.id) } })} />
            </Appear>
          ) : (
            <NotificationRow item={row.item} onPress={() => router.push({ pathname: '/n/[id]', params: { id: String(row.item.id) } })} />
          )
        }
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (more && !loading && items.length > 0) void load(true, items[items.length - 1]);
        }}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              void load(false, null);
              refreshSummary();
            }}
            tintColor={colors.accent}
          />
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xxl }} />
          ) : (
            <EmptyState
              icon={BellRing}
              title={search ? 'No matches' : 'Nothing here yet'}
              message={search ? 'Try fewer or different words.' : 'New notifications will appear here as they arrive.'}
            />
          )
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_SPACE }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={14}
        windowSize={9}
      />
    </View>
  );
}
