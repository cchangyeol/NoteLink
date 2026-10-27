import { Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/stores/toast';

/** 전역 토스트 */
export function AppOverlays() {
  const msg = useToast((s) => s.msg);
  const insets = useSafeAreaInsets();
  if (!msg) return null;
  return (
    <View
      pointerEvents="none"
      className="absolute inset-x-6"
      style={{ bottom: insets.bottom + 90 }}
    >
      <Animated.View
        entering={FadeInUp.duration(180)}
        exiting={FadeOut}
        className="rounded-2xl bg-ink/90 px-4 py-3"
      >
        <Text className="text-center text-[13px] font-medium text-white">{msg}</Text>
      </Animated.View>
    </View>
  );
}
