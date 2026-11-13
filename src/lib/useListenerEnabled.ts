import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { Listener } from './settings';

function read(): boolean {
  try {
    return Listener.isListenerEnabled();
  } catch {
    return false;
  }
}

export function useListenerEnabled(): boolean {
  const [enabled, setEnabled] = useState(read);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setEnabled(read()));
    return () => sub.remove();
  }, []);
  return enabled;
}
