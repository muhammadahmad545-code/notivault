import { Button, Card, Chip, Hero, ListItem, Pressable, Screen, SectionTitle, SegmentedControl, TAB_BAR_SPACE, Text, Toggle, UpdateCard, themePreference, toMessage, useTheme, useToast, useUpdater } from '@basalt/core';
import { canUseLock, useLock } from '@basalt/core/src/lock/LockGate';
import ArchiveRestore from 'lucide-react-native/icons/archive-restore';
import FileSpreadsheet from 'lucide-react-native/icons/file-spreadsheet';
import HardDriveDownload from 'lucide-react-native/icons/hard-drive-download';
import KeyRound from 'lucide-react-native/icons/key-round';
import Wallet from 'lucide-react-native/icons/wallet';
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
import { PasswordDialog } from '../../components/PasswordDialog';
import { TimeField } from '../../components/TimeField';
import { inspect, restore, saveBackup } from '../../lib/backup';
import { exportHistory } from '../../lib/exportCsv';
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
  const appLock = useLock();
  const exportCsv = async (days: number) => {
    try {
      const count = await appLock.runExternal(() => exportHistory(days));
      if (count === 0) toast('Nothing to export yet.', 'danger');
    } catch (error) {
      toast(toMessage(error, 'Could not export.'), 'danger');
    }
  };

  const [busy, setBusy] = React.useState<'save' | 'restore' | null>(null);
  const [dialog, setDialog] = React.useState<null | { mode: 'create' } | { mode: 'unlock'; uri: string; error: string | null }>(null);

  const startBackup = () => setDialog({ mode: 'create' });

  const finishBackup = async (password: string | null) => {
    setDialog(null);
    setBusy('save');
    try {
      const saved = await appLock.runExternal(() => saveBackup(password));
      if (saved) {
        const rules = saved.rules === 1 ? '1 rule' : `${saved.rules} rules`;
        Alert.alert('Backup saved', `${saved.notifications.toLocaleString()} notifications, ${rules} and your settings are in the file. On a new phone, install Notivault and use Restore from a backup.`);
      }
    } catch (error) {
      toast(toMessage(error, 'Could not save the backup.'), 'danger');
    } finally {
      setBusy(null);
    }
  };

  const confirmRestore = (uri: string, password: string | null, info: { exportedAt: number; count: number; settings: string; encrypted: boolean }) => {
    const when = info.exportedAt > 0 ? new Date(info.exportedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'an unknown date';
    Alert.alert(
      'Restore this backup?',
      `Made ${when}, with ${info.count.toLocaleString()} notifications plus rules and settings.\n\nNotifications already on this phone are kept and duplicates are skipped. Rules are added to yours; digest times, quiet hours and the other settings are replaced by the backup’s.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            setBusy('restore');
            try {
              const r = await restore(uri, password, info);
              const parts = [`${r.added.toLocaleString()} notifications added`];
              if (r.skipped > 0) parts.push(`${r.skipped.toLocaleString()} were already here`);
              parts.push(r.rulesAdded === 1 ? '1 rule added' : `${r.rulesAdded} rules added`);
              Alert.alert('Restore finished', `${parts.join(', ')}. Your settings now match the backup.`);
              if (r.syncError) toast(r.syncError, 'danger');
            } catch (error) {
              toast(toMessage(error, 'Could not restore the backup.'), 'danger');
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  const openBackup = async (uri: string, password: string | null) => {
    const result = await inspect(uri, password);
    if (result.ok) {
      setDialog(null);
      confirmRestore(uri, password, result.info);
    } else {
      setDialog({ mode: 'unlock', uri, error: result.reason === 'wrongPassword' ? 'That password is not right for this backup.' : null });
    }
  };

  const startRestore = async () => {
    setBusy('restore');
    try {
      const uri = await appLock.runExternal(() => Listener.pickBackupFile());
      if (uri) await openBackup(uri, null);
    } catch (error) {
      toast(toMessage(error, 'Could not open that file.'), 'danger');
    } finally {
      setBusy(null);
    }
  };

  const unlockBackup = async (password: string | null) => {
    if (dialog?.mode !== 'unlock') return;
    setBusy('restore');
    try {
      await openBackup(dialog.uri, password);
    } catch (error) {
      setDialog(null);
      toast(toMessage(error, 'Could not open that file.'), 'danger');
    } finally {
      setBusy(null);
    }
  };

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

      <SectionTitle title="Your data" />
      <Card style={{ paddingVertical: spacing.xs }}>
        <ListItem title="Money" subtitle="Spending and income read from bank and wallet alerts" icon={Wallet} chevron onPress={() => router.push('/money')} />
        <ListItem
          title="Back up to a file"
          subtitle={busy === 'save' ? 'Saving…' : 'All notifications, rules and settings, for a new phone or safekeeping. Save it to Downloads, Drive or anywhere.'}
          icon={HardDriveDownload}
          chevron
          onPress={busy ? undefined : startBackup}
        />
        <ListItem
          title="Restore from a backup"
          subtitle={busy === 'restore' ? 'Restoring…' : 'Bring back notifications, rules and settings from a Notivault backup file'}
          icon={ArchiveRestore}
          chevron
          onPress={busy ? undefined : () => void startRestore()}
        />
        <ListItem title="Export last 30 days (CSV)" subtitle="Opens Android's share sheet. One-time codes are left out." icon={FileSpreadsheet} chevron onPress={() => void exportCsv(30)} />
        <ListItem
          title="Copy-code tile"
          subtitle="Pull down the shade twice, tap the pencil and add “Copy code”. One tap copies the newest code from the last 15 minutes."
          icon={KeyRound}
        />
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
        <ListItem title="Private by design" subtitle="Notifications are stored only on this phone and never uploaded. Android's automatic cloud backup is off; only backup files you save yourself leave the phone. The only network request is the update check." icon={ShieldCheck} iconTone="success" />
        <ListItem title="Show the introduction again" icon={Sparkles} chevron onPress={() => onboardedSetting.set(false)} />
        <ListItem title="Source code" subtitle="MIT licensed on GitHub" icon={Code} chevron onPress={() => void Linking.openURL(REPO_URL)} />
      </Card>
      <Button label="Delete all history" icon={Trash2} variant="danger" onPress={wipe} />
      <PasswordDialog
        visible={dialog !== null}
        mode={dialog?.mode ?? 'create'}
        error={dialog?.mode === 'unlock' ? dialog.error : null}
        busy={busy !== null}
        onCancel={() => setDialog(null)}
        onSubmit={(password) => void (dialog?.mode === 'unlock' ? unlockBackup(password) : finishBackup(password))}
      />
    </Screen>
  );
}
