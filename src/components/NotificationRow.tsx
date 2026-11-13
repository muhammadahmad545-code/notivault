import { Chip, Pressable, Text, formatRelativeTime, useTheme } from '@basalt/core';
import { BellOff, Clock3, KeyRound, MessagesSquare, Star, Trash } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import type { CapturedNotification } from '../../modules/pulse-listener';

const HUES = [12, 32, 160, 200, 230, 265, 300, 340];

export function AppAvatar({ name, pkg, size = 40 }: { name: string; pkg: string; size?: number }) {
  const { scheme } = useTheme();
  let hash = 0;
  for (const c of pkg) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  const hue = HUES[Math.abs(hash) % HUES.length];
  const bg = scheme === 'dark' ? `hsl(${hue}, 45%, 22%)` : `hsl(${hue}, 70%, 92%)`;
  const fg = scheme === 'dark' ? `hsl(${hue}, 80%, 75%)` : `hsl(${hue}, 60%, 32%)`;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 3, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="bodyStrong" style={{ color: fg }}>
        {(name.trim()[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

export function NotificationRow({ item, onPress }: { item: CapturedNotification; onPress: () => void }) {
  const { colors, spacing } = useTheme();
  const deletedByApp = item.removedBy === 'app' && item.state === 'shown';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.app}: ${item.title}. ${item.text}`}
      pressScale={0.99}
      onPress={onPress}
      style={{ flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}
    >
      <AppAvatar name={item.app} pkg={item.package} />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text variant="caption" color="textMuted" numberOfLines={1} style={{ flex: 1 }}>
            {item.app}
          </Text>
          {item.starred ? <Star size={14} color={colors.warning} fill={colors.warning} /> : null}
          <Text variant="caption" color="textFaint">
            {formatRelativeTime(item.postedAt)}
          </Text>
        </View>
        {item.title ? (
          <Text variant="bodyStrong" numberOfLines={1}>
            {item.title}
          </Text>
        ) : null}
        <Text color="textMuted" numberOfLines={2}>
          {item.text}
        </Text>
        {item.code || item.state !== 'shown' || item.versions > 1 || deletedByApp ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs }}>
            {item.code ? <Chip label={item.code} icon={KeyRound} /> : null}
            {item.state === 'muted' ? <Chip label="Quieted" icon={BellOff} /> : null}
            {item.state === 'digest' ? <Chip label="In digest" icon={Clock3} /> : null}
            {item.versions > 1 ? <Chip label={`${item.versions} in thread`} icon={MessagesSquare} /> : null}
            {deletedByApp ? <Chip label="Removed by app" icon={Trash} tone="warning" /> : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
