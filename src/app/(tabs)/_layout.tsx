import { NativeTabs } from 'expo-router/native-tabs';

import { useTheme } from '@/hooks/use-theme';

const TABS = [
  { name: 'index', label: 'Food', md: 'restaurant', sf: 'fork.knife' },
  { name: 'gym', label: 'Gym', md: 'fitness_center', sf: 'dumbbell' },
  { name: 'shop', label: 'Shop', md: 'shopping_cart', sf: 'cart' },
  { name: 'profile', label: 'Profile', md: 'person', sf: 'person' },
] as const;

export default function AppTabs() {
  const colors = useTheme();

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      {TABS.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon md={tab.md} sf={tab.sf} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
