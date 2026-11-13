/**
 * One-time-code detection. Reference implementation for Pulse.extractCode in Kotlin: keep the
 * two in step. A code is only taken from a message that talks about codes, and four-digit years
 * are ignored so "your 2026 statement" is not mistaken for a code.
 */
const CONTEXT = /\b(code|otp|one[- ]time|verification|verify|passcode|password|pin|token|login)\b/i;
const CANDIDATE = /(\d{4,8}|\d{3}[- ]\d{3})/g;

export function extractCode(title: string, text: string): string | null {
  const body = `${title} ${text}`;
  if (!CONTEXT.test(body)) return null;
  for (const match of body.matchAll(CANDIDATE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    // A neighbouring digit, or a dash or space joined to another digit, means this is part of a longer number.
    const before = body.slice(Math.max(0, start - 2), start);
    const after = body.slice(end, end + 2);
    if (/\d[- ]?$/.test(before) || /^[- ]?\d/.test(after)) continue;
    const code = match[0].replace(/[- ]/g, '');
    if (code.length === 4 && Number(code) >= 1900 && Number(code) <= 2099) continue;
    return code;
  }
  return null;
}
