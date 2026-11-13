import { FloatingTabBar } from '@basalt/core';
import { Tabs } from 'expo-router/js-tabs';
import { BarChart3, Clock3, Inbox, Settings } from 'lucide-react-native';
import React from 'react';

const ITEMS = [
  { name: 'index', label: 'Inbox', icon: Inbox },
  { name: 'digest', label: 'Digest', icon: Clock3 },
  { name: 'insights', label: 'Insights', icon: BarChart3 },
  { name: 'settings', label: 'Settings', icon: Settings },
];

export default function TabsLayout() {
  return <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <FloatingTabBar {...props} items={ITEMS} />} />;
}
