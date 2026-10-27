import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DDay } from '@notelink/shared';
import { api } from '@/lib/api';
import { addDays, dLabel, md, ymd, seoul } from '@/lib/dates';
import { toast } from '@/stores/toast';
import {
  Alert,
  Badge,
  Btn,
  Card,
  Dashed,
  Header,
  Input,
  Label,
  Screen,
  Toggle,
  cx,
} from '@/components/ui';

// p.51 #13 D-day 관리 / #14 반복 목표 설정

export function DDayScreen() {
  const qc = useQueryClient();
  const ddays = useQuery({ queryKey: ['ddays'], queryFn: api.calendar.ddays });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const add = useMutation({
    mutationFn: () =>
      api.calendar.addDday({ title: title.trim(), date: ymd(addDays(seoul(), 50)) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ddays'] });
      setTitle('');
      setAdding(false);
      toast('D-day를 추가했어요');
    },
  });
  const row = (d: DDay) => (
    <View key={d._id} className="flex-row items-center gap-3 border-b border-line py-3">
      <View className="h-9 w-9 items-center justify-center rounded-full bg-cream">
        <Text>
          {d.source === 'todo'
            ? d.kind === '시험'
              ? '🎯'
              : '📘'
            : d.daysLeft < 0
              ? '🎉'
              : d.title === '수능'
                ? '🎓'
                : '📝'}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-semibold text-ink">{d.title}</Text>
        <Text className="text-[12px] text-sub">
          {d.kind} · {d.source === 'todo' ? md(d.date) : d.date.replaceAll('-', '.')}
        </Text>
      </View>
      <Badge tone={d.source === 'todo' ? 'sun' : d.daysLeft < 0 ? 'gray' : 'mint'}>
        {dLabel(d.daysLeft)}
      </Badge>
    </View>
  );
  return (
    <Screen>
      <Header title="D-day 관리" sub="과제 · 시험으로 등록한 할 일이 자동으로 올라옵니다." />
      <Label>할 일에서 자동</Label>
      {ddays.data?.filter((d) => d.source === 'todo').map(row)}
      <Label>직접 등록</Label>
      {ddays.data?.filter((d) => d.source === 'manual').map(row)}
      {adding ? (
        <View className="mt-3 flex-row gap-2">
          <Input
            className="flex-1"
            value={title}
            onChangeText={setTitle}
            placeholder="예) 기말고사"
            autoFocus
          />
          <Btn
            small
            className="w-20"
            disabled={!title.trim()}
            loading={add.isPending}
            onPress={() => add.mutate()}
          >
            추가
          </Btn>
        </View>
      ) : (
        <Dashed onPress={() => setAdding(true)}>+ D-day 추가</Dashed>
      )}
    </Screen>
  );
}

const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const dayNum = (i: number) => (i + 1) % 7;

export function RepeatGoalScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const qc = useQueryClient();
  const goals = useQuery({ queryKey: ['goals', 'recurring'], queryFn: api.study.recurringGoals });
  const g = goals.data?.find((x) => x._id === id) ?? goals.data?.[0];
  const [name, setName] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [min, setMin] = useState(30);
  const [remind, setRemind] = useState(true);
  const [del, setDel] = useState(false);
  // 고칠 목표를 처음 불러왔을 때만 입력값을 채운다 — 재조회가 입력을 덮어쓰지 않게 (렌더 중 상태 조정)
  const [loaded, setLoaded] = useState<string>();
  if (g && g._id !== loaded) {
    setLoaded(g._id);
    setName(g.name);
    setDays(g.days);
    setMin(g.targetMin);
    setRemind(g.remindEnabled);
  }
  const save = useMutation({
    mutationFn: () =>
      api.study.saveRecurringGoal({
        _id: g?._id,
        name,
        days,
        targetMin: min,
        remindEnabled: remind,
        remindTime: '20:00',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      router.back();
      toast('반복 목표를 저장했어요');
    },
  });
  const remove = useMutation({
    mutationFn: () => api.study.deleteRecurringGoal(g!._id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      setDel(false);
      router.back();
      toast('목표를 삭제했어요');
    },
  });
  return (
    <Screen
      footer={
        <>
          <Btn loading={save.isPending} onPress={() => save.mutate()}>
            저장하기
          </Btn>
          {g && (
            <Pressable onPress={() => setDel(true)} className="mt-3">
              <Text className="text-center text-[13px] text-danger">목표 삭제</Text>
            </Pressable>
          )}
        </>
      }
    >
      <Header title="반복 목표 설정" />
      <Label>목표명</Label>
      <Input value={name} onChangeText={setName} placeholder="매일 30분 영어 단어 암기" />
      <Label>반복 요일</Label>
      <View className="flex-row gap-2">
        {DAYS.map((d, i) => {
          const on = days.includes(dayNum(i));
          return (
            <Pressable
              key={d}
              onPress={() =>
                setDays((p) => (on ? p.filter((x) => x !== dayNum(i)) : [...p, dayNum(i)]))
              }
              className={cx(
                'h-10 w-10 items-center justify-center rounded-full',
                on ? 'bg-brand' : 'bg-cream',
              )}
            >
              <Text className={cx('text-[13px] font-semibold', on ? 'text-white' : 'text-sub')}>
                {d}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Label>목표 시간</Label>
      <View className="flex-row items-center rounded-2xl border border-line p-2">
        <Pressable
          accessibilityLabel="줄이기"
          onPress={() => setMin((m) => Math.max(10, m - 10))}
          className="h-10 w-10 items-center justify-center rounded-xl bg-cream"
        >
          <Text className="text-[20px]">−</Text>
        </Pressable>
        <Text className="flex-1 text-center text-[18px] font-bold text-ink">{min}분</Text>
        <Pressable
          accessibilityLabel="늘리기"
          onPress={() => setMin((m) => m + 10)}
          className="h-10 w-10 items-center justify-center rounded-xl bg-cream"
        >
          <Text className="text-[20px]">+</Text>
        </Pressable>
      </View>
      <Card tone="white" className="mt-3 flex-row items-center px-4 py-3">
        <View className="flex-1">
          <Text className="text-[14px] font-semibold text-ink">리마인드 알림</Text>
          <Text className="text-[12px] text-sub">매일 20:00에 알려드려요</Text>
        </View>
        <Toggle label="리마인드 알림" on={remind} onChange={setRemind} />
      </Card>
      {g && (
        <View className="mt-3 rounded-xl bg-sun/15 px-3 py-2.5">
          <Text className="text-[13px] text-ink">🔥 연속 {g.streak}일 달성 중</Text>
        </View>
      )}
      <Alert
        open={del}
        title="반복 목표를 삭제할까요?"
        body="연속 달성 기록도 함께 사라져요."
        secondary="취소"
        onSecondary={() => setDel(false)}
        primary="삭제"
        onPrimary={() => remove.mutate()}
      />
    </Screen>
  );
}
