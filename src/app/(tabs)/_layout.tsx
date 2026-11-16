import { SlotTabs } from '@basalt/core';
import BarChart3 from 'lucide-react-native/icons/chart-column';
import Clock3 from 'lucide-react-native/icons/clock-3';
import Inbox from 'lucide-react-native/icons/inbox';
import Settings from 'lucide-react-native/icons/settings';
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
