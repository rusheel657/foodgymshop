import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rusheelnujetti.foodgymshop',
  appName: 'Food Gym Shop',
  webDir: 'dist',
  backgroundColor: '#000000',
  plugins: {
    // Roll back to the bundle inside the APK if an update doesn't call ready() within 10 s.
    LocalNotifications: { smallIcon: 'ic_stat_icon', iconColor: '#3dbe72' },
    LiveUpdate: { readyTimeout: 10000, autoDeleteBundles: true },
  },
};

export default config;
