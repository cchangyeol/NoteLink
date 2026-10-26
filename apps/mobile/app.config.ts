import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'NoteLink',
  slug: 'notelink',
  scheme: 'notelink',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  plugins: ['expo-router', 'expo-status-bar'],
};

export default config;
