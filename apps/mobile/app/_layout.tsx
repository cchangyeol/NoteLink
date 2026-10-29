import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as ScreenOrientation from 'expo-screen-orientation';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query';
import { connectSocket } from '@/lib/socket';
import { registerPush } from '@/lib/push';
import { useAuth } from '@/stores/auth';
import { AppOverlays } from '@/components/AppOverlays';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const ready = useAuth((s) => s.ready);
  const token = useAuth((s) => s.tokens?.accessToken);
  useEffect(() => {
    useAuth.getState().load();
    // 기본은 세로 고정, 자동 측정 화면만 가로 (p.49)
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  // 로그인되면 실시간 연결 · 푸시 토큰 등록
  useEffect(() => {
    if (!token) return;
    connectSocket();
    registerPush().catch(() => {});
  }, [token]);
  if (!ready) return null;
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#fff' } }}>
        <Stack.Screen name="landscape" options={{ animation: 'fade', orientation: 'landscape' }} />
        <Stack.Screen name="capture/camera" options={{ animation: 'fade' }} />
        <Stack.Screen name="capture/rec-live" options={{ animation: 'fade' }} />
        <Stack.Screen
          name="summary"
          options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="convert" options={{ gestureEnabled: false }} />
      </Stack>
      <AppOverlays />
    </QueryClientProvider>
  );
}
