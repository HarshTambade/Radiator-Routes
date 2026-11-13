import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.radiatorroutes.app',
  appName: 'Radiator Routes',
  webDir: 'dist',
  backgroundColor: '#f5f4f2',
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
