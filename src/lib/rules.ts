export type RuleAction = 'mute' | 'digest' | 'alert';

export interface PulseRule {
  id: string;
  name: string;
  enabled: boolean;
  /** Package names. Empty = any app. */
  apps: string[];
  /** Case-insensitive substrings of the title or text. Empty = anything. */
  keywords: string[];
  action: RuleAction;
}

export const ACTION_INFO: Record<RuleAction, { label: string; detail: string }> = {
  mute: { label: 'Quiet', detail: 'Removed from the notification shade and kept in Notivault.' },
  digest: { label: 'Hold for digest', detail: 'Removed from the shade and summarised at your digest times.' },
  alert: { label: 'Priority alert', detail: 'Notivault repeats it as a high-priority alert, even when the app itself is quiet.' },
};

/** Mirrors Pulse.match in Kotlin: the first enabled rule whose apps and keywords both match. */
export function matchRule(rules: PulseRule[], pkg: string, title: string, text: string): PulseRule | null {
  const haystack = `${title}\n${text}`.toLowerCase();
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const appOk = rule.apps.length === 0 || rule.apps.includes(pkg);
    const words = rule.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean);
    const wordOk = words.length === 0 || words.some((w) => haystack.includes(w));
    if (appOk && wordOk) return rule;
  }
  return null;
}

export function parseKeywords(input: string): string[] {
  return [...new Set(input.split(',').map((k) => k.trim()).filter(Boolean))];
}

export function validateRule(rule: PulseRule): string | null {
  if (!rule.name.trim()) return 'Give the rule a name.';
  if (rule.apps.length === 0 && rule.keywords.length === 0) return 'Pick at least one app or keyword, or the rule would catch every notification.';
  return null;
}

/** Keyword-only starting points; app-specific rules are easier to make from a notification or app page. */
export const TEMPLATES: Omit<PulseRule, 'id' | 'enabled'>[] = [
  { name: 'Urgent always gets through', apps: [], keywords: ['urgent', 'emergency', 'asap', 'call me'], action: 'alert' },
  { name: 'Quiet sales and offers', apps: [], keywords: ['sale', 'offer', '% off', 'discount', 'deal', 'coupon'], action: 'mute' },
  { name: 'Digest social likes', apps: [], keywords: ['liked your', 'reacted to', 'started following', 'mentioned you'], action: 'digest' },
];
