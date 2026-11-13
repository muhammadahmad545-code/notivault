import { Button, Card, Chip, EmptyState, IconButton, Pressable, Screen, Text, UpdateCard, toMessage, useTheme, useToast, useUpdater } from '@basalt/core';
import { useRouter } from 'expo-router';
import { BarChart3, BellRing, Clock3, ListFilter, Search, Settings, ShieldCheck, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppSummary, CapturedNotification } from '../../modules/pulse-listener';
import { NotificationRow } from '../components/NotificationRow';
import { Listener, UPDATE_SOURCE } from '../lib/settings';
import { useListenerEnabled } from '../lib/useListenerEnabled';

const PAGE = 60;
type Filter = { kind: 'all' } | { kind: 'state'; state: 'muted' | 'digest' } | { kind: 'app'; pkg: string };

function Onboarding() {
  const { spacing } = useTheme();
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <ShieldCheck size={22} />
        <Text variant="heading">Turn on notification access</Text>
      </View>
      <Text color="textMuted">
        Pulse keeps a private, searchable copy of your notifications on this phone. Android needs your permission for any app to read them. Nothing is uploaded.
      </Text>
      <Text variant="caption" color="textMuted">
        1. Tap the button and switch Pulse on.{'\n'}2. If Android says “Restricted setting”, go back, open App info, tap ⋮ → Allow restricted settings, then try again.
      </Text>
      <Button label="Open notification access" onPress={() => Listener.openListenerSettings()} />
      <Button label="Open App info" variant="secondary" onPress={() => Listener.openAppInfo()} />
    </Card>
  );
}

export default function Inbox() {
  const { colors, spacing, radius, typography } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const updater = useUpdater({ source: UPDATE_SOURCE });
  const enabled = useListenerEnabled();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [items, setItems] = useState<CapturedNotification[]>([]);
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(true);
  const request = useRef(0);

  const load = useCallback(
    async (append: boolean, before: number | null) => {
      const id = ++request.current;
      try {
        const rows = await Listener.query(
          search.trim() || null,
          filter.kind === 'app' ? filter.pkg : null,
          filter.kind === 'state' ? filter.state : null,
          before,
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
    const timer = setTimeout(() => void load(false, null), search ? 200 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  useEffect(() => {
    Listener.apps().then(setApps).catch(() => {});
    const sub = Listener.addListener('onNotification', (row) => {
      if (search || filter.kind !== 'all') return;
      setItems((current) => [row, ...current.filter((r) => r.key !== row.key)]);
    });
    return () => sub.remove();
  }, [search, filter]);

  const header = (
    <View style={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.lg, gap: spacing.lg, paddingBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Text variant="overline" color="accent">
            Basalt
          </Text>
          <Text variant="display">Pulse</Text>
        </View>
        <IconButton icon={BarChart3} label="Insights" onPress={() => router.push('/insights')} />
        <IconButton icon={Settings} label="Settings" onPress={() => router.push('/settings')} />
      </View>
      <UpdateCard updater={updater} />
      {!enabled ? <Onboarding /> : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label="Rules" icon={ListFilter} variant="secondary" onPress={() => router.push('/rules')} style={{ flex: 1 }} />
        <Button label="Digest" icon={Clock3} variant="secondary" onPress={() => router.push('/digest')} style={{ flex: 1 }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md }}>
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
        {search ? <IconButtonSmall onPress={() => setSearch('')} /> : null}
      </View>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={[{ key: 'all' }, { key: 'muted' }, { key: 'digest' }, ...apps.slice(0, 12).map((a) => ({ key: a.package, app: a }))]}
        keyExtractor={(i) => i.key}
        contentContainerStyle={{ gap: spacing.sm }}
        renderItem={({ item }) => {
          if (item.key === 'all') return <Chip label="All" selected={filter.kind === 'all'} onPress={() => setFilter({ kind: 'all' })} />;
          if (item.key === 'muted' || item.key === 'digest') {
            const state = item.key;
            return <Chip label={state === 'muted' ? 'Quieted' : 'Digest'} selected={filter.kind === 'state' && filter.state === state} onPress={() => setFilter({ kind: 'state', state })} />;
          }
          const app = (item as { app: AppSummary }).app;
          return <Chip label={`${app.app} ${app.count}`} selected={filter.kind === 'app' && filter.pkg === app.package} onPress={() => setFilter({ kind: 'app', pkg: app.package })} />;
        }}
      />
    </View>
  );

  return (
    <Screen scroll={false} topInset={false} contentStyle={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0 }}>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={header}
        renderItem={({ item }) => <NotificationRow item={item} onPress={() => router.push({ pathname: '/n/[id]', params: { id: String(item.id) } })} />}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (more && !loading && items.length > 0) void load(true, items[items.length - 1].postedAt);
        }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load(false, null)} tintColor={colors.accent} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xxl }} />
          ) : (
            <EmptyState
              icon={BellRing}
              title={search ? 'No matches' : 'Nothing captured yet'}
              message={search ? 'Try fewer or different words.' : enabled ? 'New notifications will appear here as they arrive.' : 'Turn on notification access to start.'}
            />
          )
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        keyboardShouldPersistTaps="handled"
      />
    </Screen>
  );
}

function IconButtonSmall({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={12} onPress={onPress}>
      <X size={18} color={colors.textMuted} />
    </Pressable>
  );
}
