import type { PulseRule, RuleAction } from './rules';

/** The settings a backup carries. App lock stays per-phone because it depends on that phone's screen lock. */
export interface BackupSettings {
  rules: PulseRule[];
  digestTimes: number[];
  codes: boolean;
  includeOngoing: boolean;
  retentionDays: number;
  quietHours: { enabled: boolean; start: number; end: number };
}

const ACTIONS: RuleAction[] = ['mute', 'digest', 'alert'];
const RETENTION = [0, 7, 30, 90, 365];
const minute = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 24 * 60;
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);

function cleanRule(raw: unknown): PulseRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id || typeof r.name !== 'string' || !r.name.trim()) return null;
  if (!ACTIONS.includes(r.action as RuleAction)) return null;
  const apps = strings(r.apps);
  const keywords = strings(r.keywords);
  if (apps.length === 0 && keywords.length === 0) return null;
  return { id: r.id, name: r.name, enabled: r.enabled !== false, apps, keywords, action: r.action as RuleAction };
}

/**
 * Combines this phone's settings with a backup's. Rules are merged (a rule already here, by id, is kept
 * as it is); the other settings come from the backup, except that history is never kept for less time
 * than either side asked for. Anything malformed in the backup is ignored.
 */
export function mergeSettings(current: BackupSettings, raw: unknown): { settings: BackupSettings; rulesAdded: number } {
  const b = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const have = new Set(current.rules.map((r) => r.id));
  const incoming = (Array.isArray(b.rules) ? b.rules : []).map(cleanRule).filter((r): r is PulseRule => r !== null && !have.has(r.id));
  const unique = incoming.filter((r, i) => incoming.findIndex((x) => x.id === r.id) === i);
  const valid = Array.isArray(b.digestTimes) ? [...new Set(b.digestTimes.filter(minute))].sort((x, y) => x - y).slice(0, 6) : null;
  // An empty list is a real choice (no digests); a list with nothing usable in it is not.
  const times = valid && (valid.length > 0 || (b.digestTimes as unknown[]).length === 0) ? valid : null;
  const q = b.quietHours && typeof b.quietHours === 'object' ? (b.quietHours as Record<string, unknown>) : null;
  const quietOk = q !== null && typeof q.enabled === 'boolean' && minute(q.start) && minute(q.end);
  return {
    settings: {
      rules: [...current.rules, ...unique],
      digestTimes: times ?? current.digestTimes,
      codes: typeof b.codes === 'boolean' ? b.codes : current.codes,
      includeOngoing: typeof b.includeOngoing === 'boolean' ? b.includeOngoing : current.includeOngoing,
      retentionDays: typeof b.retentionDays === 'number' && RETENTION.includes(b.retentionDays) ? longerRetention(current.retentionDays, b.retentionDays) : current.retentionDays,
      quietHours: quietOk ? { enabled: q.enabled as boolean, start: q.start as number, end: q.end as number } : current.quietHours,
    },
    rulesAdded: unique.length,
  };
}

/** Never shorten history while importing: keep whichever retention keeps more. 0 means forever. */
export function longerRetention(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.max(a, b);
}

export function backupFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `notivault-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}
