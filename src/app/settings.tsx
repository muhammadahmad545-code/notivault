import { Button, Card, Chip, Header, ListItem, Pressable, Screen, SectionTitle, SegmentedControl, Text, Toggle, UpdateCard, themePreference, toMessage, useTheme, useToast, useUpdater } from '@basalt/core';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Code, Plus, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react-native';
import React from 'react';
import { Alert, View } from 'react-native';
import { TimeField } from '../components/TimeField';
import { canUseLock } from '../components/LockGate';
import { Listener, REPO_URL, UPDATE_SOURCE, codesSetting, digestTimesSetting, lockSetting, ongoingSetting, retentionSetting, syncNative } from '../lib/settings';
import { clock } from '../lib/time';

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
    Alert.alert('Delete all history?', 'Every captured notification is erased from this phone. This cannot be undone.', [
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
    <Screen>
      <Header title="Settings" onBack={() => router.back()} />

      <SectionTitle title="Privacy" />
      <Card style={{ gap: spacing.xs }}>
        {row('Lock with fingerprint or screen lock', 'Asked when Pulse opens and after 30 seconds away.', lock, async (on) => {
          if (on && !(await canUseLock())) return toast('Set up a screen lock or fingerprint on this phone first.', 'danger');
          setLock(on);
        })}
        {row('One-time code helper', 'Detects verification codes and offers a Copy button.', codes, (v) => apply(() => setCodes(v)))}
        {row('Include ongoing notifications', 'Music players, downloads and other persistent notices.', ongoing, (v) => apply(() => setOngoing(v)))}
        <Text variant="label" color="textMuted" style={{ marginTop: spacing.sm }}>
          Keep history for
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {RETENTION.map((d) => (
            <Chip key={d} label={d === 0 ? 'Forever' : d === 365 ? '1 year' : `${d} days`} selected={retention === d} onPress={() => apply(() => setRetention(d))} />
          ))}
        </View>
      </Card>

      <SectionTitle title="Digest times" />
      <Card style={{ gap: spacing.md }}>
        {times.map((t, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <TimeField label={`Digest ${i + 1}`} minutes={t} onChange={(m) => apply(() => setTimes(times.map((x, j) => (j === i ? m : x)).sort((a, b) => a - b)))} />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove digest at ${clock(t)}`} hitSlop={12} onPress={() => apply(() => setTimes(times.filter((_, j) => j !== i)))}>
              <X size={18} color={colors.textFaint} />
            </Pressable>
          </View>
        ))}
        {times.length < 6 ? <Button label="Add a time" icon={Plus} variant="secondary" onPress={() => apply(() => setTimes([...times, 12 * 60].sort((a, b) => a - b)))} /> : null}
        <Button label="Allow exact timing" variant="ghost" onPress={() => Listener.openExactAlarmSettings()} />
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
        <ListItem title="Source code" subtitle="MIT licensed on GitHub" icon={Code} chevron onPress={() => void Linking.openURL(REPO_URL)} />
      </Card>
      <Button label="Delete all history" icon={Trash2} variant="danger" onPress={wipe} />
    </Screen>
  );
}
