import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backupFileName, longerRetention, mergeSettings, type BackupSettings } from './backupSettings';

const fresh: BackupSettings = {
  rules: [],
  digestTimes: [480, 780, 1200],
  codes: true,
  includeOngoing: false,
  retentionDays: 30,
  quietHours: { enabled: false, start: 1320, end: 420 },
};

const rule = (id: string, name = 'Quiet sales') => ({ id, name, enabled: true, apps: [], keywords: ['sale'], action: 'mute' });

test('a new phone takes every setting from the backup', () => {
  const { settings, rulesAdded } = mergeSettings(fresh, {
    rules: [rule('a'), rule('b', 'Bank alerts')],
    digestTimes: [600, 540],
    codes: false,
    includeOngoing: true,
    retentionDays: 90,
    quietHours: { enabled: true, start: 1380, end: 360 },
  });
  assert.equal(rulesAdded, 2);
  assert.deepEqual(settings.rules.map((r) => r.id), ['a', 'b']);
  assert.deepEqual(settings.digestTimes, [540, 600]);
  assert.equal(settings.codes, false);
  assert.equal(settings.includeOngoing, true);
  assert.equal(settings.retentionDays, 90);
  assert.deepEqual(settings.quietHours, { enabled: true, start: 1380, end: 360 });
});

test('importing twice does not duplicate rules, and rules already here are kept as they are', () => {
  const here = { ...fresh, rules: [{ ...rule('a', 'My edited name'), action: 'digest' as const }] };
  const { settings, rulesAdded } = mergeSettings(here, { rules: [rule('a'), rule('a'), rule('c')] });
  assert.equal(rulesAdded, 1);
  assert.deepEqual(settings.rules.map((r) => `${r.id}:${r.name}`), ['a:My edited name', 'c:Quiet sales']);
});

test('malformed values in a backup are ignored', () => {
  const { settings, rulesAdded } = mergeSettings(fresh, {
    rules: [{ id: 'x' }, { ...rule('y'), action: 'explode' }, { ...rule('z'), keywords: [], apps: [] }, 'nope'],
    digestTimes: [99999, -1, 'noon'],
    codes: 'yes',
    retentionDays: 12,
    quietHours: { enabled: true, start: 5000, end: 10 },
  });
  assert.equal(rulesAdded, 0);
  assert.deepEqual(settings, fresh);
  assert.deepEqual(mergeSettings(fresh, null).settings, fresh);
});

test('history is never kept for less time because of an import', () => {
  assert.equal(longerRetention(30, 7), 30);
  assert.equal(longerRetention(30, 365), 365);
  assert.equal(longerRetention(0, 30), 0);
  assert.equal(longerRetention(90, 0), 0);
  assert.equal(mergeSettings({ ...fresh, retentionDays: 0 }, { retentionDays: 7 }).settings.retentionDays, 0);
});

test('backup file names carry the local date', () => {
  assert.equal(backupFileName(new Date(2026, 10, 5, 23, 59)), 'notivault-backup-2026-11-05.json');
});
