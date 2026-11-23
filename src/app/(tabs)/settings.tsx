import { Button, Card, Chip, Hero, ListItem, Pressable, Screen, SectionTitle, SegmentedControl, TAB_BAR_SPACE, Text, Toggle, UpdateCard, themePreference, toMessage, useTheme, useToast, useUpdater } from '@basalt/core';
import { canUseLock } from '@basalt/core/src/lock/LockGate';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import Code from 'lucide-react-native/icons/code';
import ListFilter from 'lucide-react-native/icons/list-filter';
import Plus from 'lucide-react-native/icons/plus';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Trash2 from 'lucide-react-native/icons/trash';
import X from 'lucide-react-native/icons/x';
import React from 'react';
import { Alert, Platform, View } from 'react-native';
import { TimeField } from '../../components/TimeField';
import { Listener, REPO_URL, UPDATE_SOURCE, codesSetting, digestTimesSetting, lockSetting, onboardedSetting, ongoingSetting, quietHoursSetting, retentionSetting, syncNative } from '../../lib/settings';
import { inWindow } from '../../lib/quiet';
import { clock } from '../../lib/time';

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

const RETENTION = [7, 30, 90, 365, 0];

export default function Settings() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [theme, setTheme] = themePreference.use();
  const [lock, setLock] = lockSetting.use();
  const [codes, setCodes] = codesSetting.use();
  const [ongoing, setOngoing] = ongoingSetting.use();
  const [retention, setRetention] = retentionSetting.use();
  const [times, setTimes] = digestTimesSetting.use();
  const [quiet, setQuiet] = quietHoursSetting.use();
  const nowMinute = new Date().getHours() * 60 + new Date().getMinutes();
  const updater = useUpdater({ source: UPDATE_SOURCE, auto: false });

  const apply = (change: () => void) => {
    change();
    const error = syncNative();
    if (error) toast(error, 'danger');
  };

  const row = (title: string, detail: string, value: boolean, onChange: (v: boolean) => void) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" color="textMuted">
          {detail}
        </Text>
      </View>
      <Toggle value={value} onChange={onChange} accessibilityLabel={title} />
    </View>
  );

  const wipe = () =>
    Alert.alert('Delete all history?', 'Every captured notification, including starred ones, is erased from this phone. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete all',
        style: 'destructive',
        onPress: async () => {
          try {
            await Listener.deleteAll();
            toast('History deleted', 'success');
          } catch (error) {
            toast(toMessage(error), 'danger');
          }
        },
      },
    ]);

  return (
    <Screen aurora bottomSpace={TAB_BAR_SPACE}>
      <Hero overline="Notivault" title="Settings" />

      <Card onPress={() => router.push('/rules')} variant="raised" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <ListFilter size={22} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">Rules</Text>
          <Text variant="caption" color="textMuted">
            Quiet, digest or escalate notifications by app and keyword
          </Text>
        </View>
      </Card>

      <SectionTitle title="Privacy" />
      <Card style={{ gap: spacing.xs }}>
        {row('App lock', 'Fingerprint, face or your screen lock on open and after 30 seconds away. Also hides Notivault in the recent-apps view.', lock, async (on) => {
          if (on && !(await canUseLock())) return toast('Set up a screen lock on this phone first.', 'danger');
          setLock(on);
        })}
        {row('One-time code helper', 'Detects verification codes and offers a Copy button. On Android 15, the system may hide codes from apps like Notivault.', codes, (v) => apply(() => setCodes(v)))}
        {row('Include ongoing notifications', 'Music players, navigation, downloads and other persistent notices.', ongoing, (v) => apply(() => setOngoing(v)))}
        <Text variant="label" color="textMuted" style={{ marginTop: spacing.sm }}>
          Keep history for
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {RETENTION.map((d) => (
            <Chip key={d} label={d === 0 ? 'Forever' : d === 365 ? '1 year' : `${d} days`} selected={retention === d} onPress={() => apply(() => setRetention(d))} />
          ))}
        </View>
        <Text variant="caption" color="textFaint">
          Starred notifications are always kept.
        </Text>
      </Card>

      <SectionTitle title="Quiet hours" />
      <Card style={{ gap: spacing.md }}>
        {row(
          'Quiet hours',
          quiet.enabled && inWindow(quiet.start, quiet.end, nowMinute)
            ? 'On now. Notifications are held for your digest; priority rules and codes still come through.'
            : 'During these hours, notifications are held for your digest instead of interrupting you. Priority rules and codes still come through.',
          quiet.enabled,
          (v) => apply(() => setQuiet({ ...quiet, enabled: v })),
        )}
        {quiet.enabled ? (
          <View style={{ gap: spacing.md }}>
            <Text variant="caption" color="textMuted">
              From
            </Text>
            <TimeField label="Quiet hours start" minutes={quiet.start} onChange={(m) => apply(() => setQuiet({ ...quiet, start: m }))} />
            <Text variant="caption" color="textMuted">
              Until
            </Text>
            <TimeField label="Quiet hours end" minutes={quiet.end} onChange={(m) => apply(() => setQuiet({ ...quiet, end: m }))} />
            {quiet.start === quiet.end ? (
              <Text variant="caption" color="danger">
                Start and end are the same, so quiet hours never apply.
              </Text>
            ) : null}
          </View>
        ) : null}
      </Card>

      <SectionTitle title="Digest times" />
      <Card style={{ gap: spacing.md }}>
        {times.map((t, i) => (
          <View key={`${i}-${t}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <TimeField label={`Digest ${i + 1}`} minutes={t} onChange={(m) => apply(() => setTimes([...new Set(times.map((x, j) => (j === i ? m : x)))].sort((a, b) => a - b)))} />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove digest at ${clock(t)}`} hitSlop={12} onPress={() => apply(() => setTimes(times.filter((_, j) => j !== i)))}>
              <X size={18} color={colors.textFaint} />
            </Pressable>
          </View>
        ))}
        {times.length < 6 ? (
          <Button
            label="Add a time"
            icon={Plus}
            variant="secondary"
            onPress={() => {
              const free = [12 * 60, 18 * 60, 21 * 60, 10 * 60, 16 * 60, 7 * 60].find((m) => !times.includes(m)) ?? 12 * 60 + times.length * 5;
              apply(() => setTimes([...times, free].sort((a, b) => a - b)));
            }}
          />
        ) : null}
        {Platform.OS === 'android' && Number(Platform.Version) < 33 ? <Button label="Allow exact timing" variant="ghost" onPress={() => Listener.openExactAlarmSettings()} /> : null}
      </Card>

      <SectionTitle title="Appearance" />
      <SegmentedControl options={THEMES} value={theme} onChange={setTheme} />

      <SectionTitle title="Updates" />
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">Version {updater.currentVersion}</Text>
          <Text variant="caption" color="textMuted">
            Updates come from this app’s GitHub releases.
          </Text>
        </View>
        <Button label="Check" icon={RefreshCw} variant="secondary" loading={updater.state.phase === 'checking'} onPress={() => void updater.check()} />
      </Card>
      <UpdateCard updater={updater} />

      <Card style={{ paddingVertical: spacing.xs }}>
        <ListItem title="Private by design" subtitle="Notifications are stored only on this phone, excluded from backups, and never uploaded. The only network request is the update check." icon={ShieldCheck} iconTone="success" />
        <ListItem title="Show the introduction again" icon={Sparkles} chevron onPress={() => onboardedSetting.set(false)} />
        <ListItem title="Source code" subtitle="MIT licensed on GitHub" icon={Code} chevron onPress={() => void Linking.openURL(REPO_URL)} />
      </Card>
      <Button label="Delete all history" icon={Trash2} variant="danger" onPress={wipe} />
    </Screen>
  );
}
