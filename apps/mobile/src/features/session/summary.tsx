import { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Accelerometer } from 'expo-sensors';
import * as ScreenOrientation from 'expo-screen-orientation';
import { X } from 'lucide-react-native';
import { api } from '@/lib/api';
import { goalLabel, hm, hms } from '@/lib/dates';
import { useNow } from '@/hooks';
import { useSession } from '@/stores/session';
import { toast } from '@/stores/toast';
import { Btn, Card, Progress, Screen } from '@/components/ui';
import { C } from '@/theme';

// p.48 #6 공부 종료 요약

export function SummaryScreen() {
  const { sec, points } = useLocalSearchParams<{ sec?: string; points?: string }>();
  const today = useQuery({ queryKey: ['study', 'today'], queryFn: api.study.today });
  const weekly = useQuery({ queryKey: ['study', 'weekly'], queryFn: api.study.weekly });
  const goal = useQuery({ queryKey: ['goal', 'weekly'], queryFn: api.study.weeklyGoal });
  const items = today.data?.items ?? [];
  const total = items.reduce((a, i) => a + i.accumulatedSec, 0);
  const done = items.filter((i) => i.goalMin && i.accumulatedSec >= i.goalMin * 60).length;
  const goalMin = goal.data?.targetMin ?? 1260;
  const pct = Math.round(((weekly.data?.totalSec ?? 0) / 60 / goalMin) * 100);
  useEffect(() => {
    if (Number(points) > 0) toast(`순공 세션 완료 +${points}P`);
  }, [points]);
  const home = () => router.dismissTo('/');
  return (
    <Screen
      footer={
        <>
          <Btn onPress={home}>홈으로</Btn>
          <Pressable onPress={() => router.replace('/record')} className="mt-2">
            <Text className="text-center text-[13px] text-brand">학습 기록 보기 ›</Text>
          </Pressable>
        </>
      }
    >
      <View className="items-end pt-3">
        <Pressable accessibilityLabel="닫기" onPress={home} hitSlop={10}>
          <X size={20} color={C.sub} />
        </Pressable>
      </View>
      <View className="items-center">
        <Text className="text-[32px]">🎉</Text>
        <Text className="text-[19px] font-bold text-ink">수고했어요, 형욱 님</Text>
        <Text className="text-[12px] text-sub">
          오늘 순공시간{sec ? ` · 이번 세션 ${hm(Number(sec))}` : ''}
        </Text>
        <Text className="font-mono text-[34px] font-bold text-brand">{hms(total)}</Text>
      </View>
      <Card className="mt-4 p-4">
        <View className="flex-row justify-between">
          <Text className="text-[13px] font-semibold text-ink">항목별 목표</Text>
          <Text className="text-[13px] text-brand">
            {items.length}개 중 {done}개 달성
          </Text>
        </View>
        {items.map((i) => (
          <View key={i._id} className="mt-3">
            <View className="flex-row justify-between">
              <Text className="text-[13px] text-ink">
                {i.title} · {i.subjectName}
              </Text>
              <Text className="text-[13px] text-ink">
                <Text className="font-bold">{Math.floor(i.accumulatedSec / 60)}분</Text>
                <Text className="text-sub">
                  {' '}
                  / {goalLabel(i.goalMin)}
                  {i.goalMin && i.accumulatedSec >= i.goalMin * 60 ? ' ✓' : ''}
                </Text>
              </Text>
            </View>
            <Progress
              value={i.goalMin ? (i.accumulatedSec / (i.goalMin * 60)) * 100 : 0}
              className="mt-1.5"
            />
          </View>
        ))}
      </Card>
      <View className="mt-4 flex-row justify-between">
        <Text className="text-[14px] font-semibold text-ink">이번주 목표 {goalMin / 60}시간</Text>
        <Text className="text-[14px] font-semibold text-brand">{pct}%</Text>
      </View>
      <Progress value={pct} className="mt-1.5" />
      <Text className="mt-1 text-[12px] text-sub">
        {hm(weekly.data?.totalSec ?? 0)} · 지난주보다 1시간 40분 늘었어요
      </Text>
      <Card tone="white" className="mt-4 p-4">
        <Text className="text-[14px] font-semibold text-ink">오늘 공부를 노트로 남겨둘까요?</Text>
        <Text className="text-[12px] text-sub">
          올린 필기·녹음은 오늘 공부한 시간과 함께 기록돼요
        </Text>
        <View className="mt-3 flex-row gap-2">
          <Card
            tone="mint"
            className="flex-1 items-center py-3"
            onPress={() =>
              router.navigate({ pathname: '/(tabs)/note', params: { upload: 'hand' } })
            }
          >
            <Text>✏️</Text>
            <Text className="text-[13px] font-semibold text-ink">필기 사진</Text>
            <Text className="text-[11px] text-sub">촬영 · 갤러리</Text>
          </Card>
          <Card
            tone="mint"
            className="flex-1 items-center py-3"
            onPress={() => router.navigate({ pathname: '/(tabs)/note', params: { upload: 'rec' } })}
          >
            <Text>🎙</Text>
            <Text className="text-[13px] font-semibold text-ink">녹음</Text>
            <Text className="text-[11px] text-sub">파일 · 실시간</Text>
          </Card>
        </View>
      </Card>
    </Screen>
  );
}

/** p.49 #8 가로로 돌리면 자동 측정 — 세로로 세우면 측정을 멈추고 돌아간다 */
export function LandscapeScreen() {
  const s = useSession();
  const today = useQuery({ queryKey: ['study', 'today'], queryFn: api.study.today });
  const now = useNow();
  const active = today.data?.items.find((i) => i._id === s.itemId);
  const total =
    (today.data?.items ?? []).reduce((a, i) => a + i.accumulatedSec, 0) + s.elapsed(now);
  const leaving = useRef(false);
  const exit = () => {
    if (leaving.current) return;
    leaving.current = true;
    s.pause();
    router.back();
  };
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    if (!s.since && s.itemId) s.resume();
    Accelerometer.setUpdateInterval(400);
    const sub = Accelerometer.addListener(({ y }) => Math.abs(y) > 0.8 && exit());
    return () => {
      sub.remove();
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Pressable onPress={exit} className="flex-1 items-center justify-center bg-black px-10">
      <View className="absolute top-8 left-10 flex-row items-center gap-1.5">
        <View className="h-1.5 w-1.5 rounded-full bg-sun" />
        <Text className="text-[13px] text-white">자동 측정 중</Text>
      </View>
      <Text className="text-[16px] font-semibold text-white">
        {active ? `${active.title} · ${active.subjectName}` : '순공시간'}
      </Text>
      <Text
        className="font-mono text-[84px] font-bold text-[#f08a2e]"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {hms(total)}
      </Text>
      <Text className="absolute bottom-8 text-[12px] text-white/60">
        세로로 돌리면 측정을 멈춰요
      </Text>
    </Pressable>
  );
}
