import * as Application from 'expo-application';
import type { BackupInfo } from '../../modules/pulse-listener';
import { backupFileName, mergeSettings, type BackupSettings } from './backupSettings';
import { Listener, codesSetting, digestTimesSetting, ongoingSetting, quietHoursSetting, retentionSetting, rulesSetting, syncNative } from './settings';

export function currentSettings(): BackupSettings {
  return {
    rules: rulesSetting.get(),
    digestTimes: digestTimesSetting.get(),
    codes: codesSetting.get(),
    includeOngoing: ongoingSetting.get(),
    retentionDays: retentionSetting.get(),
    quietHours: quietHoursSetting.get(),
  };
}

/** Asks where to save, then writes the backup. Null when the user cancelled the save screen. */
export async function saveBackup(password: string | null): Promise<{ notifications: number; rules: number } | null> {
  const uri = await Listener.pickBackupDestination(backupFileName());
  if (!uri) return null;
  const settings = currentSettings();
  const notifications = await Listener.exportBackup(uri, JSON.stringify(settings), Application.nativeApplicationVersion ?? '', password);
  return { notifications, rules: settings.rules.length };
}

export type Inspected = { ok: true; info: BackupInfo } | { ok: false; reason: 'needsPassword' | 'wrongPassword' };

export async function inspect(uri: string, password: string | null): Promise<Inspected> {
  try {
    return { ok: true, info: await Listener.inspectBackup(uri, password) };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ERR_NEEDS_PASSWORD') return { ok: false, reason: 'needsPassword' };
    if (code === 'ERR_WRONG_PASSWORD') return { ok: false, reason: 'wrongPassword' };
    throw error;
  }
}

/**
 * Settings first, so the restored retention is in force before old notifications arrive (the
 * listener prunes by retention), then the notifications themselves.
 */
export async function restore(uri: string, password: string | null, info: BackupInfo) {
  let raw: unknown = {};
  try {
    raw = JSON.parse(info.settings);
  } catch {
    raw = {};
  }
  const { settings, rulesAdded } = mergeSettings(currentSettings(), raw);
  rulesSetting.set(settings.rules);
  digestTimesSetting.set(settings.digestTimes);
  codesSetting.set(settings.codes);
  ongoingSetting.set(settings.includeOngoing);
  retentionSetting.set(settings.retentionDays);
  quietHoursSetting.set(settings.quietHours);
  const syncError = syncNative();
  const { added, skipped } = await Listener.importBackupNotifications(uri, password);
  return { added, skipped, rulesAdded, syncError };
}
