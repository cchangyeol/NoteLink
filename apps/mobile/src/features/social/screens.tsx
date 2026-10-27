import { useRef, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Search as SearchIcon } from 'lucide-react-native';
import type { Message, User } from '@notelink/shared';
import { api } from '@/lib/api';
import { socket } from '@/lib/socket';
import { timeAgo } from '@/lib/dates';
import { useSocket } from '@/hooks';
import { toast } from '@/stores/toast';
import {
  Avatar,
  Btn,
  Card,
  Dialog,
  Group,
  Header,
  Row,
  Screen,
  Search,
  Sheet,
  Two,
  cx,
} from '@/components/ui';
import { C } from '@/theme';
import { StatusText } from './drawer';

// p.53~55 친구 추가 · 요청 · 채팅 · 삭제

export function FriendAddScreen() {
  const [q, setQ] = useState('');
  const [sent, setSent] = useState(false);
  const result = useQuery({
    queryKey: ['user-search', q],
    queryFn: () => api.social.search(q),
    enabled: q.trim().length > 0,
  });
  const send = useMutation({
    mutationFn: (userId: string) => api.social.sendRequest(userId),
    onSuccess: () => {
      setSent(true);
      toast('친구 요청을 보냈어요');
    },
  });
  const found = result.data?.[0];
  return (
    <Screen>
      <Header title="친구 추가" />
      <Search
        value={q}
        onChangeText={(v) => {
          setQ(v);
          setSent(false);
        }}
        placeholder="닉네임을 입력해주세요."
      />
      {!q && (
        <Text className="mt-4 text-center text-[12px] text-sub">
          닉네임으로 친구를 찾아보세요 · 예) 홍길동
        </Text>
      )}
      {q.trim() && result.isSuccess && !found && (
        <Card className="mt-3 items-center py-10">
          <SearchIcon size={22} color={C.sub} />
          <Text className="mt-2 text-[14px] font-semibold text-ink">해당 친구는 없습니다.</Text>
          <Text className="text-[12px] text-sub">닉네임을 정확히 입력했는지 확인해주세요</Text>
        </Card>
      )}
      {found && (
        <>
          <Text className="mt-4 text-[12px] text-sub">검색 결과 {result.data!.length}</Text>
          <View className="mt-2 flex-row items-center gap-3 py-2">
            <Avatar name={found.nickname} size={40} tone="mint" />
            <View>
              <Text className="text-[15px] font-semibold text-ink">{found.nickname}</Text>
              <Text className="text-[12px] text-sub">
                {found.handle} · 함께 아는 친구 {found.mutualCount ?? 0}명
              </Text>
            </View>
          </View>
          <Btn
            small
            kind={sent ? 'outline' : 'primary'}
            disabled={sent}
            loading={send.isPending}
            onPress={() => send.mutate(found.userId)}
          >
            {sent ? '요청 보냄' : '친구 요청 보내기'}
          </Btn>
        </>
      )}
    </Screen>
  );
}

export function RequestsScreen() {
  const qc = useQueryClient();
  const reqs = useQuery({ queryKey: ['friend-requests'], queryFn: api.social.received });
  const respond = useMutation({
    mutationFn: ({ id, ok }: { id: string; ok: boolean; name: string }) =>
      api.social.respond(id, ok),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['friend-requests'] });
      qc.invalidateQueries({ queryKey: ['friends'] });
      if (v.ok) toast(`${v.name}님과 친구가 됐어요`);
    },
  });
  return (
    <Screen>
      <Header title={`받은 친구 요청 (${reqs.data?.length ?? 0})`} />
      {reqs.data?.length === 0 && (
        <Text className="py-16 text-center text-[13px] text-sub">받은 친구 요청이 없어요</Text>
      )}
      <View className="gap-5">
        {reqs.data?.map((r) => (
          <View key={r._id}>
            <View className="flex-row items-center gap-3">
              <Avatar name={r.requester.nickname} size={36} tone="mint" />
              <View>
                <Text className="text-[15px] font-semibold text-ink">{r.requester.nickname}</Text>
                <Text className="text-[12px] text-sub">
                  {r.requester.handle} · {timeAgo(r.requestedAt)} 요청
                </Text>
              </View>
            </View>
            <View className="mt-2">
              <Two>
                <Btn
                  small
                  onPress={() =>
                    respond.mutate({ id: r._id, ok: true, name: r.requester.nickname })
                  }
                >
                  수락
                </Btn>
                <Btn
                  small
                  kind="outline"
                  onPress={() =>
                    respond.mutate({ id: r._id, ok: false, name: r.requester.nickname })
                  }
                >
                  거절
                </Btn>
              </Two>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

export function ChatScreen() {
  const {
    id,
    name = '지우',
    status = 'resting',
  } = useLocalSearchParams<{ id: string; name?: string; status?: User['status'] }>();
  const qc = useQueryClient();
  const room = useQuery({ queryKey: ['dm', id], queryFn: () => api.social.openDirect(id) });
  const history = useQuery({
    queryKey: ['messages', room.data?._id],
    queryFn: () => api.social.messages(room.data!._id),
    enabled: !!room.data,
  });
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [v, setV] = useState('');
  const [menu, setMenu] = useState(false);
  const [del, setDel] = useState(false);
  const list = useRef<FlatList<Message>>(null);
  // 대화 기록을 불러오면 목록을 채운다 (렌더 중 상태 조정)
  const [loaded, setLoaded] = useState<typeof history.data>();
  if (history.data && history.data !== loaded) {
    setLoaded(history.data);
    setMsgs(history.data);
  }
  useSocket(
    'chat:message',
    (m) =>
      m.chatRoomId === room.data?._id &&
      setMsgs((p) => (p.some((x) => x._id === m._id) ? p : [...p, m])),
    [room.data?._id],
  );

  const send = () => {
    if (!v.trim() || !room.data) return;
    socket.emit(
      'chat:send',
      { chatRoomId: room.data._id, text: v.trim(), clientId: `c${Date.now()}` },
      (m) => setMsgs((p) => [...p, m]),
    );
    setV('');
  };
  const remove = useMutation({
    mutationFn: () => api.social.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friends'] });
      setDel(false);
      router.back();
      toast(`${name}님을 친구에서 삭제했어요`);
    },
  });

  return (
    <Screen
      scroll={false}
      footer={
        <View className="flex-row items-center rounded-full border border-line px-4">
          <TextInput
            value={v}
            onChangeText={setV}
            onSubmitEditing={send}
            returnKeyType="send"
            placeholder="메시지 보내기"
            placeholderTextColor={C.sub}
            className="h-11 flex-1 text-[14px] text-ink"
          />
          <Pressable onPress={send} hitSlop={8}>
            <Text className="text-[13px] font-semibold text-brand">전송</Text>
          </Pressable>
        </View>
      }
    >
      <Header
        right={
          <Pressable accessibilityLabel="더보기" onPress={() => setMenu(true)} hitSlop={10}>
            <MoreHorizontal size={20} color={C.sub} />
          </Pressable>
        }
      />
      <View className="-mt-2 mb-4 flex-row items-center gap-2">
        <Avatar name={name} size={34} tone="mint" />
        <View>
          <Text className="text-[15px] font-bold text-ink">{name}</Text>
          <StatusText status={status} />
        </View>
      </View>
      <FlatList
        ref={list}
        data={msgs}
        keyExtractor={(m) => m._id}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        contentContainerClassName="gap-3 pb-4"
        renderItem={({ item: m }) => {
          const mine = m.senderId === 'u-me';
          return (
            <View className={cx('flex-row', mine && 'justify-end')}>
              <View
                className={cx(
                  'max-w-[75%] rounded-2xl px-3.5 py-2',
                  mine ? 'bg-brand' : 'bg-cream',
                )}
              >
                <Text className={cx('text-[13px]', mine ? 'text-white' : 'text-ink')}>
                  {m.text}
                </Text>
              </View>
            </View>
          );
        }}
      />
      <Sheet open={menu} onClose={() => setMenu(false)}>
        <Group>
          <Row
            onPress={() => {
              setMenu(false);
              toast('알림을 껐어요');
            }}
          >
            알림 끄기
          </Row>
          <Row
            danger
            onPress={() => {
              setMenu(false);
              setDel(true);
            }}
          >
            친구 삭제
          </Row>
        </Group>
      </Sheet>
      <Dialog open={del} onClose={() => setDel(false)}>
        <Text className="text-[16px] font-bold text-ink">{name}님을 친구에서 삭제할까요?</Text>
        <Text className="mt-1.5 text-[12px] text-sub">
          대화 내용과 공유한 시간표도 함께 사라져요
        </Text>
        <View className="mt-5 w-full">
          <Two>
            <Btn small kind="cream" onPress={() => setDel(false)}>
              취소
            </Btn>
            <Btn small kind="danger" loading={remove.isPending} onPress={() => remove.mutate()}>
              삭제
            </Btn>
          </Two>
        </View>
      </Dialog>
    </Screen>
  );
}
