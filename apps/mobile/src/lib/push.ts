import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

// FCM · APNs 푸시 (p.16: 메인 API가 푸시 발송). 기기 토큰을 서버에 등록한다.

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function registerPush() {
  if (!Device.isDevice) return; // 시뮬레이터는 푸시 토큰이 없다
  if (Platform.OS === 'android')
    await Notifications.setNotificationChannelAsync('default', {
      name: '기본',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  const { data } = await Notifications.getDevicePushTokenAsync();
  await api.me.registerDevice({
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    pushToken: String(data),
    locale: 'ko-KR',
  });
}

/** 로컬 알림 (변환 완료 · 반복 목표 리마인드) */
export function notifyLocal(title: string, body: string) {
  return Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
}
