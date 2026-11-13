import { useCallback, useEffect, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { Listener } from './settings';

export interface Setup {
  listener: boolean;
  notifications: boolean;
}

function read(): Setup {
  try {
    return { listener: Listener.isListenerEnabled(), notifications: Listener.notificationsEnabled() };
  } catch {
    return { listener: false, notifications: false };
  }
}

/** The two things Pulse needs from Android, re-checked whenever the user returns from Settings. */
export function useSetup(): [Setup, () => void] {
  const [state, setState] = useState<Setup>(read);
  const reload = useCallback(() => setState(read()), []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && reload());
    return () => sub.remove();
  }, [reload]);
  return [state, reload];
}

/** Ask for POST_NOTIFICATIONS (Android 13+); if Android will not ask again, open the app's notification settings. */
export async function requestNotifications(): Promise<boolean> {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    if (result === PermissionsAndroid.RESULTS.GRANTED) return true;
  }
  if (!read().notifications) Listener.openAppInfo();
  return read().notifications;
}
