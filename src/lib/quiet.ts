/** Mirrors Pulse.inQuietHours in Kotlin: is `minute` (since midnight) inside the window? */
export function inWindow(start: number, end: number, minute: number): boolean {
  if (start === end) return false;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}
