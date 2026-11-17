import { NativeModule, requireNativeModule } from 'expo';

export type NotificationState = 'shown' | 'muted' | 'digest';

export interface CapturedNotification {
  id: number;
  key: string;
  package: string;
  app: string;
  title: string;
  text: string;
  category: string | null;
  postedAt: number;
  removedAt: number | null;
  /** opened | dismissed | app | pulse | expired | other */
  removedBy: string | null;
  state: NotificationState;
  ruleName: string | null;
  code: string | null;
  starred: boolean;
  /** How many distinct versions this notification had (edits, deletions). */
  versions: number;
}

export interface AppSummary {
  package: string;
  app: string;
  count: number;
  lastAt: number;
}

export interface Stats {
  total: number;
  quieted: number;
  codes: number;
  perApp: { package: string; app: string; count: number }[];
  perHour: number[];
  perDay: Record<string, number>;
}

type Events = {
  onNotification: (row: CapturedNotification) => void;
};

declare class PulseListenerModule extends NativeModule<Events> {
  isListenerEnabled(): boolean;
  openListenerSettings(): void;
  openAppInfo(): void;
  openExactAlarmSettings(): void;
  /** state: 'shown' | 'muted' | 'digest' | 'starred' | null. Pages with (beforeAt, beforeId) from the last row. */
  query(search: string | null, pkg: string | null, state: string | null, beforeAt: number | null, beforeId: number | null, limit: number): Promise<CapturedNotification[]>;
  setStarred(id: number, starred: boolean): Promise<void>;
  remindLater(id: number, at: number): Promise<void>;
  notificationsEnabled(): boolean;
  versions(key: string): Promise<CapturedNotification[]>;
  byId(id: number): Promise<CapturedNotification | null>;
  apps(): Promise<AppSummary[]>;
  stats(since: number, pkg: string | null): Promise<Stats>;
  deleteAll(): Promise<void>;
  deleteOne(id: number): Promise<void>;
  getLastDigestAt(): number;
  setRules(json: string): void;
  setDigestTimes(json: string): void;
  setOptions(codes: boolean, includeOngoing: boolean, retentionDays: number): Promise<void>;
  sendDigestNow(): void;
  setQuietHours(enabled: boolean, start: number, end: number): void;
}

export default requireNativeModule<PulseListenerModule>('PulseListener');
