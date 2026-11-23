import { ErrorBoundary, Onboarding, ThemeProvider, ToastProvider, useBasaltFonts, useTheme } from '@basalt/core';
import { LockGate } from '@basalt/core/src/lock/LockGate';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import BellRing from 'lucide-react-native/icons/bell-ring';
import Clock3 from 'lucide-react-native/icons/clock-3';
import KeyRound from 'lucide-react-native/icons/key-round';
import Search from 'lucide-react-native/icons/search';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ACCENT, lockSetting, onboardedSetting, syncNative } from '../lib/settings';

SplashScreen.preventAutoHideAsync().catch(() => {});

const PAGES = [
  { icon: BellRing, title: 'Every notification, kept', body: 'Notivault keeps a private history of what your phone showed you, including messages that were later edited or deleted.' },
  { icon: Search, title: 'Find anything', body: 'Search every notification by any word, filter by app, star the ones that matter, and get reminded about them later.' },
  { icon: Clock3, title: 'You decide what interrupts', body: 'Quiet noisy apps, hold others for a digest at times you choose, and escalate the messages that really matter.' },
  { icon: KeyRound, title: 'Codes, one tap', body: 'Verification codes are spotted automatically and offered with a Copy button. Everything stays on this phone.' },
];

function Navigator() {
  const { colors, scheme } = useTheme();
  const [onboarded, setOnboarded] = onboardedSetting.use();
  if (!onboarded) return <Onboarding appName="Notivault" pages={PAGES} onDone={() => setOnboarded(true)} />;
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }} />
    </>
  );
}

export default function RootLayout() {
  const fontsReady = useBasaltFonts();

  useEffect(() => {
    syncNative();
  }, []);

  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  if (!fontsReady) return null;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider accent={ACCENT}>
            <ToastProvider>
              <LockGate setting={lockSetting} appName="Notivault" message="Your notification history stays hidden until you unlock.">
                <Navigator />
              </LockGate>
            </ToastProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
