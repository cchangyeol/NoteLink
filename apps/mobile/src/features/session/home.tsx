import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useKeepAwake } from 'expo-keep-awake';
import { Accelerometer } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import { Pause, Play, Square, Users } from 'lucide-react-native';
import { api } from '@/lib/api';
import { dLabel, goalLabel, hm, hms, seoul, ymd } from '@/lib/dates';
import { useNow } from '@/hooks';
import { AUTO_END_MS, useSession } from '@/stores/session';
import { Badge, Btn, Card, Dashed, Screen, cx } from '@/components/ui';
import { C } from '@/theme';
import { AddItemSheet, WeekGoalSheet } from './sheets';
import { SocialDrawer } from '../social/drawer';
import { NetBanner } from '@/components/NetBanner';

// p.46~49 홈 · 공부 측정

export function HomeScreen() {
  const qc = useQueryClient();
  const now = useNow();
  const day = ymd(seoul(now));
  const today = useQuery({ queryKey: ['study', 'today', day], queryFn: api.study.today });
  const weekly = useQuery({ queryKey: ['study', 'weekly', day], queryFn: api.study.weekly });
  const goal = useQuery({ queryKey: ['goal', 'weekly', day], queryFn: api.study.weeklyGoal });
  const ddays = useQuery({ queryKey: ['ddays'], queryFn: api.calendar.ddays });
  const me = useQuery({ queryKey: ['me'], queryFn: api.me.get });
  const s = useSession();
  const running = !!s.since;
  const [sheet, setSheet] = useState<null | 'add' | 'goal'>(null);
  const [drawer, setDrawer] = useState(false);

  const items = today.data?.items ?? [];
  const has = items.length > 0;
  const active = items.find((i) => i._id === s.itemId);
  const live = (id: string, base: number) => base + (id === s.itemId ? s.elapsed(now) : 0);
  const todaySec = items.reduce((a, i) => a + live(i._id, i.accumulatedSec), 0);
  const weekSec = (weekly.data?.totalSec ?? 0) + (s.itemId ? s.elapsed(now) : 0);
  const goalMin = goal.data?.targetMin ?? 21 * 60;
  const pct = has ? Math.round((weekSec / 60 / goalMin) * 100) : 0;
  const nextDday = ddays.data?.find((d) => d.daysLeft >= 0);

  const toggle = async (id: string) => {
    Haptics.selectionAsync();
    if (s.itemId === id && running) return s.pause();
    // 다른 항목으로 바꾸면 start()가 앞 세션을 끝낸다 → 서버 누적을 다시 받아 방금 공부한 시간이 빠지지 않게
    const switching = !!s.itemId && s.itemId !== id;
    await s.start(id);
    if (switching) await qc.invalidateQueries({ queryKey: ['study'] });
  };
  const ending = useRef(false);
  const finish = async (reason = 'manual') => {
    if (ending.current) return;
    ending.current = true;
    try {
      const r = await s.end(reason);
      await qc.invalidateQueries({ queryKey: ['study'] });
      router.push({
        pathname: '/summary',
        params: { sec: String(r.sec), points: String(r.pointsEarned) },
      });
    } finally {
      ending.current = false;
    }
  };

  // 쉬는 중 10분이 지나면 자동 종료 (p.48)
  useEffect(() => {
    if (s.pausedAt && now - s.pausedAt > AUTO_END_MS) finish('auto_pause_timeout');
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View className="flex-1 bg-white">
      {running && <KeepAwake />}
      {s.itemId && <TiltWatcher />}
      <Screen>
        <NetBanner />
        <View className="flex-row items-start justify-between pt-4">
          <View>
            {has && <Text className="text-[12px] text-sub">안녕하세요</Text>}
            <Text className="text-[22px] font-bold text-ink">
              {has ? `${me.data?.nickname ?? ''} 님` : '안녕하세요👋'}
            </Text>
            {!has && (
              <Text className="text-[12px] text-sub">노트링크와 함께 학습을 시작해보세요</Text>
            )}
          </View>
          <Pressable
            accessibilityLabel="친구"
            onPress={() => setDrawer(true)}
            className="h-9 w-9 items-center justify-center rounded-full bg-mint"
          >
            <Users size={18} color={C.brand} />
          </Pressable>
        </View>

        {has && nextDday && (
          <Pressable
            onPress={() => router.push('/dday')}
            className="mt-3 flex-row items-center gap-3 px-1 py-2"
          >
            <View className="h-9 w-9 items-center justify-center rounded-full bg-cream">
              <Text>🎯</Text>
            </View>
            <View className="flex-1">
              <Text className="text-[14px] font-semibold text-ink">{nextDday.title}</Text>
              <Text className="text-[12px] text-sub">
                {nextDday.kind} · {nextDday.date.slice(5).replace('-', '월 ')}일
              </Text>
            </View>
            <Badge tone="sun">{dLabel(nextDday.daysLeft)}</Badge>
          </Pressable>
        )}

        {/* 순공시간 카드 */}
        <View className="mt-3 rounded-3xl bg-night p-5">
          <View className="flex-row items-center justify-between">
            <Text className="text-[12px] text-white/70">오늘 순공시간</Text>
            <View className="flex-row items-center gap-1">
              <View
                className={cx('h-1.5 w-1.5 rounded-full', running ? 'bg-sun' : 'bg-white/50')}
              />
              <Text className="text-[12px] text-white/70">
                {running ? '측정 중' : active ? '일시정지' : '측정 대기'}
              </Text>
            </View>
          </View>
          <Text className={cx('mt-1 text-[13px]', running ? 'text-sun' : 'text-white/60')}>
            {active
              ? `${running ? '▶ ' : ''}${active.title} · ${active.subjectName}`
              : has
                ? '오늘 공부할 목록에서 항목을 고르세요'
                : '먼저 공부할 항목을 추가해 주세요'}
          </Text>
          <Text
            className="mt-1 font-mono text-[44px] font-bold text-white"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {hms(active || todaySec ? todaySec : 0)}
          </Text>
          <Pressable onPress={() => setSheet('goal')}>
            <Text className="text-[13px] text-white/80">
              {running
                ? `책상 앞이에요 · 이번주 목표 ${pct}%`
                : active
                  ? '쉬는 중 · 10분이 지나면 자동으로 종료돼요'
                  : has
                    ? `이번주 ${hm(weekSec)} / 목표 ${goalMin / 60}시간 (${pct}%) ›`
                    : '이번주 목표 0% ›'}
            </Text>
          </Pressable>
          <Pressable onPress={() => active && router.push('/landscape')}>
            <Text className="mt-0.5 text-[11px] text-white/45">
              ⟳ 가로로 돌리면 자동 측정 · 세로로 세우면 정지
            </Text>
          </Pressable>
          {active ? (
            <View className="mt-4 flex-row gap-2">
              <View className="flex-1">
                {running ? (
                  <Btn
                    kind="gray"
                    small
                    icon={<Pause size={16} color="#fff" />}
                    onPress={() => s.pause()}
                  >
                    일시정지
                  </Btn>
                ) : (
                  <Btn
                    kind="sun"
                    small
                    icon={<Play size={16} color={C.ink} />}
                    onPress={() => s.resume()}
                  >
                    계속하기
                  </Btn>
                )}
              </View>
              <View className="flex-1">
                <Btn
                  kind={running ? 'sun' : 'gray'}
                  small
                  icon={<Square size={14} color={running ? C.ink : '#fff'} />}
                  onPress={() => finish()}
                >
                  종료
                </Btn>
              </View>
            </View>
          ) : (
            <View className="mt-4 rounded-xl bg-white/5 py-2.5">
              <Text className="text-center text-[12px] text-white/70">
                {has
                  ? '아래 목록에서 ▶을 눌러 공부를 시작하세요'
                  : '항목을 추가하면 ▶로 바로 시작할 수 있어요'}
              </Text>
            </View>
          )}
        </View>

        <View className="mt-6 mb-2 flex-row items-center justify-between">
          <Text className="text-[17px] font-bold text-ink">오늘 공부할 목록</Text>
          <Text className="text-[12px] text-sub">{items.length}개</Text>
        </View>
        {!has && (
          <View className="items-center rounded-2xl border border-dashed border-cream-2 py-5">
            <Text className="text-[13px] text-sub">아직 공부할 목록이 없어요</Text>
            <Text className="text-[11px] text-sub/80">
              과목이나 할 일을 추가하면 항목별로 시간을 따로 재요
            </Text>
          </View>
        )}
        <View className="gap-2">
          {items.map((it) => {
            const on = it._id === s.itemId;
            const play = on && running;
            return (
              <View
                key={it._id}
                className={cx(
                  'flex-row items-center gap-3 rounded-2xl border px-4 py-3',
                  on ? 'border-brand/40 bg-mint' : 'border-line bg-white',
                )}
              >
                <View className={cx('h-8 w-1 rounded-full', on ? 'bg-brand' : 'bg-cream-2')} />
                <View className="flex-1">
                  <Text className="text-[15px] font-semibold text-ink">{it.title}</Text>
                  <Text className="text-[12px] text-sub">
                    {it.subjectName} · 목표 {goalLabel(it.goalMin)}
                  </Text>
                </View>
                <Text className="font-mono text-[14px] font-semibold text-ink/80">
                  {hms(live(it._id, it.accumulatedSec))}
                </Text>
                <Pressable
                  accessibilityLabel={`${it.title} ${play ? '일시정지' : '시작'}`}
                  onPress={() => toggle(it._id)}
                  className={cx(
                    'h-9 w-9 items-center justify-center rounded-full',
                    on ? 'bg-brand' : 'bg-mint',
                  )}
                >
                  {play ? (
                    <Pause size={15} color="#fff" />
                  ) : (
                    <Play size={15} color={on ? '#fff' : C.brand} />
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>
        <Dashed onPress={() => setSheet('add')}>+ 공부할 항목 추가</Dashed>

        <Text className="mt-6 mb-2 text-[17px] font-bold text-ink">학습 기록</Text>
        <Card className="p-4" onPress={() => router.push('/record')}>
          <View className="flex-row justify-between">
            <Text className="text-[12px] text-sub">이번주 순공시간</Text>
            <Text className="text-[12px] font-semibold text-brand">기록 · 캘린더 ›</Text>
          </View>
          <Text className="mt-1 text-[22px] font-bold text-ink">
            {has ? hm(weekSec) : '0시간 0분'}
          </Text>
          <Text className="text-[12px] text-sub">
            {has
              ? `지난주보다 ${hm(Math.abs(weekly.data?.diffFromLastWeekSec ?? 0)).replace('0시간 ', '')} ${(weekly.data?.diffFromLastWeekSec ?? 0) < 0 ? '줄었어요' : '늘었어요'}`
              : '학습 기록이 쌓이면 스트릭이 시작돼요'}
          </Text>
        </Card>
      </Screen>
      <AddItemSheet open={sheet === 'add'} onClose={() => setSheet(null)} />
      <WeekGoalSheet open={sheet === 'goal'} onClose={() => setSheet(null)} />
      <SocialDrawer open={drawer} onClose={() => setDrawer(false)} />
    </View>
  );
}

function KeepAwake() {
  useKeepAwake('study-timer');
  return null;
}

/** 기기를 가로로 눕히면 자동 측정 화면으로 (p.49 #8, 기기 기울기 센서) */
function TiltWatcher() {
  const pushed = useRef(false);
  useFocusEffect(
    useCallback(() => {
      pushed.current = false;
      Accelerometer.setUpdateInterval(400);
      const sub = Accelerometer.addListener(({ x, y }) => {
        if (!pushed.current && Math.abs(x) > 0.8 && Math.abs(y) < 0.35) {
          pushed.current = true;
          router.push('/landscape');
        }
      });
      return () => sub.remove();
    }, []),
  );
  return null;
}
