import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react-native';
import type { Todo, TodoType } from '@notelink/shared';
import { api } from '@/lib/api';
import { md, today } from '@/lib/dates';
import { toast } from '@/stores/toast';
import { Badge, Btn, Chip, Dashed, Input, Label, Sheet, cx } from '@/components/ui';

// p.50 #11 날짜별 할 일 / p.51 #12 할 일 추가

const slotLabel = (t: Todo) =>
  t.timeSlot === 'none'
    ? '시간 미정'
    : t.dueTime
      ? `${t.timeSlot === 'am' ? '오전' : '오후'} ${Number(t.dueTime.slice(0, 2)) % 12 || 12}시`
      : t.timeSlot === 'am'
        ? '오전'
        : '오후';

export function TodoSheet({
  open,
  date,
  onClose,
  onAdd,
}: {
  open: boolean;
  date: string;
  onClose: () => void;
  onAdd: () => void;
}) {
  const qc = useQueryClient();
  const todos = useQuery({
    queryKey: ['todos', date],
    queryFn: () => api.calendar.todos(date),
    enabled: open,
  });
  const toggle = useMutation({
    mutationFn: (t: Todo) => api.calendar.toggleTodo(t._id, !t.done),
    onMutate: (t) =>
      qc.setQueryData<Todo[]>(['todos', date], (p) =>
        p?.map((x) => (x._id === t._id ? { ...x, done: !x.done } : x)),
      ),
  });
  const list = todos.data ?? [];
  return (
    <Sheet open={open} onClose={onClose}>
      <View className="flex-row items-center justify-between">
        <Text className="text-[18px] font-bold text-ink">{md(date)}</Text>
        {date === today() && <Badge>오늘</Badge>}
      </View>
      <Text className="text-[12px] text-sub">
        할 일 {list.length}개 · {list.filter((t) => t.done).length}개 완료
      </Text>
      <View className="mt-3 gap-2">
        {list.length === 0 && (
          <Text className="py-6 text-center text-[13px] text-sub">이 날은 할 일이 없어요</Text>
        )}
        {list.map((t) => (
          <Pressable
            key={t._id}
            onPress={() => toggle.mutate(t)}
            className="flex-row items-center gap-3 rounded-2xl border border-line px-4 py-3"
          >
            <View
              className={cx(
                'h-6 w-6 items-center justify-center rounded-md border',
                t.done ? 'border-brand bg-brand' : 'border-cream-2',
              )}
            >
              {t.done && <Check size={14} color="#fff" />}
            </View>
            <View>
              <Text className={cx('text-[14px]', t.done ? 'text-sub line-through' : 'text-ink')}>
                {t.content}
              </Text>
              <Text className="text-[11px] text-sub">
                {t.subjectName ?? '일반'} · {slotLabel(t)}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
      <Dashed onPress={onAdd}>+ 할 일 추가</Dashed>
    </Sheet>
  );
}

const TYPES: [TodoType, string][] = [
  ['general', '일반'],
  ['assignment', '과제'],
  ['exam', '시험'],
];
const SLOTS: [Todo['timeSlot'], string][] = [
  ['none', '시간 미정'],
  ['am', '오전'],
  ['pm', '오후'],
  ['custom', '직접 입력'],
];

export function AddTodoSheet({
  open,
  date,
  onClose,
}: {
  open: boolean;
  date: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: api.study.subjects });
  const [content, setContent] = useState('');
  const [type, setType] = useState<TodoType>('assignment');
  const [slot, setSlot] = useState<Todo['timeSlot']>('none');
  const [subj, setSubj] = useState<string | null>('영어');
  const add = useMutation({
    mutationFn: () =>
      api.calendar.addTodo({
        content: content.trim(),
        todoType: type,
        dueDate: date,
        timeSlot: slot,
        subjectName: subj,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todos'] });
      qc.invalidateQueries({ queryKey: ['ddays'] });
      qc.invalidateQueries({ queryKey: ['study', 'month'] });
      toast(type === 'general' ? '할 일을 추가했어요' : '할 일을 추가하고 홈 D-day에 표시했어요');
      setContent('');
      onClose();
    },
  });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="할 일 추가"
      right={
        <Pressable onPress={onClose} hitSlop={10}>
          <Text className="text-[13px] text-sub">취소</Text>
        </Pressable>
      }
    >
      <Text className="-mt-2 text-[12px] text-sub">
        과제 · 시험으로 고르면 홈 화면에 D-day로 표시돼요
      </Text>
      <Label>할 일</Label>
      <Input
        value={content}
        onChangeText={(v) => setContent(v.slice(0, 40))}
        placeholder="수학 워크북 3단원 제출"
        right={`${content.length}/40`}
        autoFocus
      />
      <Label>유형</Label>
      <View className="flex-row gap-2">
        {TYPES.map(([k, l]) => (
          <Chip key={k} on={type === k} onPress={() => setType(k)}>
            {l}
          </Chip>
        ))}
      </View>
      <Label>날짜</Label>
      <View className="h-12 flex-row items-center rounded-xl border border-line px-4">
        <Text className="flex-1 text-[14px] text-ink">📅 {md(date)}</Text>
        <Text className="text-[12px] text-brand">변경</Text>
      </View>
      <Label>시간 (선택)</Label>
      <View className="flex-row flex-wrap gap-2">
        {SLOTS.map(([k, l]) => (
          <Chip key={k} on={slot === k} onPress={() => setSlot(k)}>
            {l}
          </Chip>
        ))}
      </View>
      <Label>과목 (선택)</Label>
      <View className="flex-row flex-wrap gap-2">
        <Chip on={subj === null} onPress={() => setSubj(null)}>
          없음
        </Chip>
        {(subjects.data ?? []).slice(0, 4).map((s) => (
          <Chip key={s._id} on={subj === s.name} onPress={() => setSubj(s.name)}>
            {s.name}
          </Chip>
        ))}
      </View>
      <Btn
        className="mt-6"
        disabled={!content.trim()}
        loading={add.isPending}
        onPress={() => add.mutate()}
      >
        추가하기
      </Btn>
    </Sheet>
  );
}
