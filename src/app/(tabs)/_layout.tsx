import { SlotTabs } from '@basalt/core';
import { BarChart3, Clock3, Inbox, Settings } from 'lucide-react-native';
import React from 'react';

const TABS = [
  { href: '/', label: 'Inbox', icon: Inbox },
  { href: '/digest', label: 'Digest', icon: Clock3 },
  { href: '/insights', label: 'Insights', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function TabsLayout() {
  return <SlotTabs tabs={TABS} />;
}
