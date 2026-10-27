import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';
import { Btn, Card, Chip, Input, Label, Sheet, Toggle } from '@/components/ui';

// p.47 #2 공부할 항목 추가 / p.49 #7 이번주 목표 시간

const GOALS = { '30분': 30, '1시간': 60, '1시간 30분': 90, '직접 입력': 45 } as const;

export function AddItemSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: api.study.subjects });
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('수학');
  const [goal, setGoal] = useState<keyof typeof GOALS>('1시간');
  const add = useMutation({
    mutationFn: () =>
      api.study.addItem({
        title: title.trim() || '이차방정식 풀이',
        subjectName: subject,
        goalMin: GOALS[goal],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['study', 'today'] });
      setTitle('');
      onClose();
    },
  });
  const names = (subjects.data ?? []).slice(0, 4).map((s) => s.name);
  return (
    <Sheet open={open} onClose={onClose}>
      <Text className="text-[18px] font-bold text-ink">공부할 항목 추가</Text>
      <Text className="text-[12px] text-sub">추가한 항목마다 순공시간이 따로 쌓여요</Text>
      <Label>무엇을 공부하나요?</Label>
      <Input
        value={title}
        onChangeText={setTitle}
        placeholder="이차방정식 풀이"
        autoFocus
        returnKeyType="done"
      />
      <Label>과목</Label>
      <View className="flex-row flex-wrap gap-2">
        {[...names, '+ 새 과목'].map((x) => (
          <Chip key={x} on={subject === x} onPress={() => setSubject(x)}>
            {x}
          </Chip>
        ))}
      </View>
      <Label>오늘 목표 시간 (선택)</Label>
      <View className="flex-row flex-wrap gap-2">
        {(Object.keys(GOALS) as (keyof typeof GOALS)[]).map((x) => (
          <Chip key={x} on={goal === x} onPress={() => setGoal(x)}>
            {x}
          </Chip>
        ))}
      </View>
      <Btn className="mt-6" loading={add.isPending} onPress={() => add.mutate()}>
        추가하기
      </Btn>
    </Sheet>
  );
}

const Step = ({ label, d, onPress }: { label: string; d: number; onPress: () => void }) => (
  <Pressable
    accessibilityLabel={label}
    onPress={onPress}
    className="h-10 w-10 items-center justify-center rounded-xl bg-cream"
  >
    <Text className="text-[20px] text-ink">{d < 0 ? '−' : '+'}</Text>
  </Pressable>
);

export function WeekGoalSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const goal = useQuery({ queryKey: ['goal', 'weekly'], queryFn: api.study.weeklyGoal });
  const [h, setH] = useState(21);
  const [alarm, setAlarm] = useState(true);
  // 저장된 목표를 처음 불러왔을 때만 입력값을 채운다 — 재조회가 입력을 덮어쓰지 않게 (렌더 중 상태 조정)
  const [loaded, setLoaded] = useState(false);
  if (goal.data && !loaded) {
    setLoaded(true);
    setH(goal.data.targetMin / 60);
    setAlarm(goal.data.notify80);
  }
  const save = useMutation({
    mutationFn: () => api.study.setWeeklyGoal({ targetMin: h * 60, notify80: alarm }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goal'] });
      onClose();
      toast(`이번주 목표를 ${h}시간으로 정했어요`);
    },
  });
  return (
    <Sheet open={open} onClose={onClose}>
      <Text className="text-[18px] font-bold text-ink">이번주 목표 시간</Text>
      <Text className="text-[12px] text-sub">월요일마다 새로 시작돼요</Text>
      <View className="mt-4 flex-row items-center rounded-2xl border border-brand/40 p-2">
        <Step label="줄이기" d={-0.5} onPress={() => setH((x) => Math.max(1, x - 0.5))} />
        <Text className="flex-1 text-center text-[24px] font-bold text-ink">{h}시간</Text>
        <Step label="늘리기" d={0.5} onPress={() => setH((x) => x + 0.5)} />
      </View>
      <Text className="mt-2 text-[12px] text-sub">
        30분 단위로 조절돼요 · 하루 평균 {Math.round((h / 7) * 10) / 10}시간
      </Text>
      <Label>빠른 선택</Label>
      <View className="flex-row gap-2">
        {[14, 21, 28].map((x) => (
          <View key={x} className="flex-1">
            <Chip on={h === x} onPress={() => setH(x)}>{`${x}시간`}</Chip>
          </View>
        ))}
        <View className="flex-1">
          <Chip onPress={() => setH(18.5)}>직접 입력</Chip>
        </View>
      </View>
      <View className="mt-4 rounded-xl bg-sun/15 px-3 py-2.5">
        <Text className="text-[12px] text-ink">📈 최근 4주 평균은 18시간 30분이에요</Text>
      </View>
      <Card className="mt-3 flex-row items-center px-4 py-3">
        <View className="flex-1">
          <Text className="text-[14px] font-semibold text-ink">목표 달성 알림</Text>
          <Text className="text-[12px] text-sub">80%를 넘으면 알려드려요</Text>
        </View>
        <Toggle label="목표 달성 알림" on={alarm} onChange={setAlarm} />
      </Card>
      <Btn className="mt-5" loading={save.isPending} onPress={() => save.mutate()}>
        저장하기
      </Btn>
    </Sheet>
  );
}
