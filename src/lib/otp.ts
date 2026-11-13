/**
 * One-time-code detection. Reference implementation for Pulse.extractCode in Kotlin: keep the
 * two in step (both use ASCII [0-9] so Unicode digit handling cannot drift).
 *
 * - The message body must mention a code; the title only counts when it clearly does (so a chat
 *   named "Code Club" does not turn every number into a code).
 * - Postal "pin code" numbers and money amounts ("Rs.25000") are not codes.
 * - Among candidates, the one closest to the trigger word wins.
 * - Four-digit years are only dropped when another candidate exists.
 */
const TRIGGER = /(?:^|[^a-z])(code|otp|one[- ]time|verification|verify|passcode|pin|token)(?![a-z])/gi;
const TITLE_TRIGGER = /(otp|verification|one[- ]time|passcode|security code)/i;
const POSTAL = /\bpin\s*code\b/gi;
const CANDIDATE = /([0-9]{4,8}|[0-9]{3}[- ][0-9]{3})/g;
const MONEY_BEFORE = /(rs\.?|pkr|usd|\$|amount|amt|of rs\.?)\s*$/i;

interface Candidate {
  code: string;
  start: number;
  end: number;
}

export function extractCode(title: string, text: string): string | null {
  const body = text.replace(POSTAL, ' '.repeat(8));
  const triggers = [...body.matchAll(TRIGGER)].map((m) => (m.index ?? 0) + m[0].length / 2);
  const titleCounts = TITLE_TRIGGER.test(title);
  if (triggers.length === 0 && !titleCounts) return null;

  const candidates: Candidate[] = [];
  for (const match of body.matchAll(CANDIDATE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const before = body.slice(Math.max(0, start - 2), start);
    const after = body.slice(end, end + 2);
    // A neighbouring digit, or a dash or space joined to another digit, means a longer number.
    if (/[0-9][- ]?$/.test(before) || /^[- ]?[0-9]/.test(after)) continue;
    if (MONEY_BEFORE.test(body.slice(Math.max(0, start - 8), start))) continue;
    if (/^[.,][0-9]/.test(after)) continue;
    candidates.push({ code: match[0].replace(/[- ]/g, ''), start, end });
  }
  const nonYears = candidates.filter((c) => !(c.code.length === 4 && Number(c.code) >= 1900 && Number(c.code) <= 2099));
  const pool = nonYears.length > 0 ? nonYears : candidates;
  if (pool.length === 0) return null;
  if (triggers.length === 0) return pool[0].code;
  const distance = (c: Candidate) => Math.min(...triggers.map((t) => Math.min(Math.abs(t - c.start), Math.abs(t - c.end))));
  return [...pool].sort((a, b) => distance(a) - distance(b))[0].code;
}
