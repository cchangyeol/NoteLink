import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Plus, Volume2, X } from 'lucide-react-native';
import { ERROR_CODES, type AiJob, type Question } from '@notelink/shared';
import { api, ApiError } from '@/lib/api';
import { socket } from '@/lib/socket';
import { useSocket } from '@/hooks';
import { useAuth } from '@/stores/auth';
import { useNet } from '@/stores/net';
import { toast } from '@/stores/toast';
import { Alert, Badge, Btn, Card, Loading, Progress, Screen, Search, cx } from '@/components/ui';
import { NetBanner } from '@/components/NetBanner';
import { C } from '@/theme';
import { seoul } from '@/lib/dates';

// p.85~89 퀴즈 · 플래시카드 · 퀴즈 보관함

const Tutor = ({ size = 76 }: { size?: number }) => (
  <View
    accessibilityLabel="AI 튜터"
    className="items-center justify-center self-center rounded-full bg-[#eecaa6]"
    style={{ width: size, height: size }}
  >
    <Text style={{ fontSize: size * 0.58 }}>🧑🏻</Text>
  </View>
);

export function QuizHomeScreen() {
  const sets = useQuery({ queryKey: ['quiz-sets'], queryFn: api.quiz.sets });
  const latest = sets.data?.find((s) => s.status === 'ready');
  return (
    <Screen>
      <NetBanner />
      <Text className="pt-4 text-[22px] font-bold text-ink">학습 퀴즈</Text>
      {latest ? (
        <>
          <Card
            tone="mint"
            onPress={() => router.push({ pathname: '/play/solve', params: { setId: latest._id } })}
            className="mt-4 p-4"
          >
            <Text className="text-[12px] text-sub">이어서 풀기</Text>
            <Text className="text-[16px] font-bold text-ink">
              {latest.title} · {latest.questionCount}문제
            </Text>
            <Progress value={100} className="mt-2" />
          </Card>
          <View className="mt-3 flex-row flex-wrap justify-between gap-y-2">
            {[
              ['✏️', '퀴즈 만들기', '/(tabs)/quiz/notes'],
              ['🗂', '플래시 카드', '/play/flash'],
              ['🗃', '퀴즈 보관함', '/play/box'],
              ['✨', '유사 퀴즈', '/play/similar'],
            ].map(([ic, l, href]) => (
              <Card
                key={l}
                onPress={() =>
                  router.push({ pathname: href as never, params: { setId: latest._id } })
                }
                className="w-[48.5%] p-4"
              >
                <Text className="text-[22px]">{ic}</Text>
                <Text className="text-[14px] font-semibold text-ink">{l}</Text>
              </Card>
            ))}
          </View>
        </>
      ) : (
        sets.isSuccess && (
          <View className="items-center pt-32">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-sun/25">
              <Text className="text-[26px]">🧠</Text>
            </View>
            <Text className="mt-4 text-[15px] font-bold text-ink">아직 만들어진 퀴즈가 없어요</Text>
            <Text className="text-[12px] text-sub">노트를 업로드하면 자동으로 퀴즈가 생성돼요</Text>
            <Btn small className="mt-5 w-56" onPress={() => router.push('/(tabs)/quiz/notes')}>
              노트 업로드하고 퀴즈 만들기
            </Btn>
          </View>
        )
      )}
      {sets.isError && <ErrorAlert retry={() => sets.refetch()} />}
    </Screen>
  );
}

/** p.97 알 수 없는 오류 — 화면만 오류 처리, 입력은 그대로 보존 */
function ErrorAlert({ retry }: { retry: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <Alert
      open={open}
      title="문제가 생겼어요"
      body={`잠시 후 다시 시도해 주세요.\n작성한 내용은 그대로 보관돼 있어요.`}
      extra={
        <View className="mt-2 rounded border border-line px-1.5">
          <Text className="text-[11px] text-sub">오류 코드 E-5012</Text>
        </View>
      }
      secondary="닫기"
      onSecondary={() => setOpen(false)}
      primary="다시 시도"
      onPrimary={() => {
        setOpen(false);
        retry();
      }}
    />
  );
}

/** 퀴즈는 노트(자료) 하나로 만든다 (FR-38-02) — 폴더마다 정리가 끝난 자료를 모은다 */
async function quizNotes() {
  const folders = await api.content.folders();
  const lists = await Promise.all(
    folders.map(async (f) =>
      (await api.content.materials(f._id))
        .filter((m) => !m.processing || m.processing.status === 'done')
        .map((m) => ({ ...m, subjectName: f.subjectName })),
    ),
  );
  return lists.flat();
}

export function QuizNotesScreen() {
  const notes = useQuery({ queryKey: ['quiz-notes'], queryFn: quizNotes });
  const [picked, setPicked] = useState<string | null>(null);
  const offline = useNet((s) => s.state === 'offline');
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  const list = (notes.data ?? []).filter((f) => f.title.includes(q));
  const chosen = list.find((f) => f._id === picked);
  const make = () =>
    chosen
      ? router.push({
          pathname: '/play/gen',
          params: { materialId: chosen._id, title: chosen.title },
        })
      : toast('퀴즈를 만들 노트를 먼저 골라 주세요');
  return (
    <View className="flex-1 bg-white">
      <Screen>
        <NetBanner />
        <Text className="pt-4 pb-3 text-[16px] font-bold text-ink">
          어떤 노트로 퀴즈를 만들까요?
        </Text>
        <Search value={q} onChangeText={setQ} placeholder="노트 검색" />
        {notes.isSuccess && notes.data.length === 0 && (
          <View className="items-center py-16">
            <Text className="text-[13px] text-sub">아직 노트가 없어요</Text>
            <Btn small className="mt-4 w-44" onPress={() => router.navigate('/(tabs)/note')}>
              노트 올리러 가기
            </Btn>
          </View>
        )}
        <View className="mt-3 flex-row flex-wrap justify-between gap-y-3">
          {list.map((f, i) => (
            <Card
              key={f._id}
              tone="mint"
              onPress={() =>
                offline
                  ? toast('연결되면 퀴즈를 만들 수 있어요 · 노트는 그대로 볼 수 있어요')
                  : setPicked(f._id)
              }
              className={cx('w-[48.5%] p-2.5', picked === f._id && 'border-2 border-blue')}
            >
              <View className="h-16 rounded-xl bg-white">
                {offline && (
                  <View
                    className={cx(
                      'absolute top-2 left-2 rounded-full px-2 py-0.5',
                      i % 2 ? 'bg-sun/30' : 'border border-line bg-white',
                    )}
                  >
                    <Text className="text-[10px] font-semibold text-ink">
                      {i % 2 ? '동기화 대기' : '기기에 저장됨'}
                    </Text>
                  </View>
                )}
              </View>
              <Text className="mt-2 px-1 text-[13px] font-semibold text-ink">{f.title}</Text>
              <Text className="px-1 text-[11px] text-sub">
                {f.subjectName} · {seoul(f.createdAt).getMonth() + 1}/{seoul(f.createdAt).getDate()}
              </Text>
            </Card>
          ))}
        </View>
        {offline && (
          <View className="mt-6 rounded-full bg-mint py-2.5">
            <Text className="text-center text-[12px] font-semibold text-brand">
              저장된 노트는 그대로 볼 수 있어요
            </Text>
          </View>
        )}
      </Screen>
      {menu && (
        <View className="absolute inset-0 z-20">
          <Pressable className="absolute inset-0 bg-black/45" onPress={() => setMenu(false)} />
          <View className="absolute right-5 bottom-24 items-end gap-3">
            {(
              [
                ['플래시 카드', '🗂', () => router.push('/play/flash')],
                ['퀴즈 보관함', '🗃', () => router.push('/play/box')],
                ['새 노트 올리고 만들기', '📄', () => router.navigate('/(tabs)/note')],
                ['퀴즈 만들기', '✏️', make],
              ] as const
            ).map(([l, ic, fn], i) => (
              <Animated.View key={l} entering={ZoomIn.delay(i * 30)}>
                <Pressable
                  onPress={() => {
                    setMenu(false);
                    fn();
                  }}
                  className="flex-row items-center gap-2"
                >
                  <View className="rounded-full bg-ink px-3 py-1.5">
                    <Text className="text-[13px] font-semibold text-white">{l}</Text>
                  </View>
                  <View className="h-11 w-11 items-center justify-center rounded-full bg-white shadow">
                    <Text className="text-[18px]">{ic}</Text>
                  </View>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        </View>
      )}
      <Pressable
        accessibilityLabel={menu ? '닫기' : '메뉴'}
        onPress={() => setMenu((m) => !m)}
        className={cx(
          'absolute right-5 bottom-5 z-30 h-14 w-14 items-center justify-center rounded-full shadow-lg',
          menu ? 'bg-ink' : 'border border-line bg-white',
        )}
      >
        {menu ? <X size={22} color="#fff" /> : <Plus size={24} color={C.ink} />}
      </Pressable>
    </View>
  );
}

export function QuizGenScreen() {
  const { materialId, title = '이차방정식 풀이' } = useLocalSearchParams<{
    materialId: string;
    title?: string;
  }>();
  const qc = useQueryClient();
  const [job, setJob] = useState<AiJob | null>(null);
  const [setId, setSetId] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    api.quiz
      .createSet(materialId)
      .then((r) => {
        setJob(r.job);
        setSetId(r.quizSet._id);
        socket.emit('ai:subscribe', { jobId: r.job._id });
      })
      .catch((e) => setFailed(e instanceof ApiError ? e.code : 'NETWORK'));
  }, [materialId]);
  useSocket(
    'ai:progress',
    (p) => p.jobId === job?._id && setJob((j) => (j ? { ...j, progress: p.progress } : j)),
    [job?._id],
  );
  useSocket(
    'ai:done',
    ({ jobId, job: done }) => {
      if (jobId !== job?._id) return;
      qc.invalidateQueries({ queryKey: ['quiz-sets'] });
      if (done.status === 'succeeded')
        router.replace({ pathname: '/play/ready', params: { setId: setId!, title } });
      else setFailed(done.error ?? 'FAILED');
    },
    [job?._id, setId],
  );
  const credit = failed === ERROR_CODES.AI_CREDIT_EXHAUSTED;
  const pct = job?.progress ?? 0;
  return (
    <View className="flex-1">
      <Screen>
        <View className="items-end pt-3">
          <Pressable
            onPress={() => {
              if (job) api.ai.cancel(job._id);
              router.back();
            }}
            className="rounded-full border border-danger/30 px-3 py-1"
          >
            <Text className="text-[13px] text-danger">취소</Text>
          </Pressable>
        </View>
        <View className="items-center pt-32">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-sun/25">
            <Text className="text-[34px]">🧠</Text>
          </View>
          <Text className="mt-5 text-[15px] font-bold text-ink">문제를 생성하고 있어요</Text>
          <Text className="text-[12px] text-sub">노트 내용을 분석해서 퀴즈를 만드는 중이에요</Text>
          <Progress value={pct} className="mt-5 w-40" />
          <Text className="mt-2 text-[11px] text-sub">{pct}%</Text>
        </View>
      </Screen>
      <Alert
        open={credit}
        tone="sun"
        title={'이번 달 AI 크레딧을\n모두 사용했어요'}
        body={`문제를 3개까지 만들었어요.\n갱신 후 이어서 만들 수 있어요.`}
        extra={
          <View className="mt-3 w-full">
            <Text className="text-right text-[11px] text-sub">3 / 5</Text>
            <Progress value={60} />
          </View>
        }
        secondary="나중에"
        onSecondary={() => router.back()}
        primary="만든 문제 보기"
        onPrimary={() =>
          router.replace({ pathname: '/play/solve', params: { setId: setId ?? '' } })
        }
      />
      <Alert
        open={!!failed && !credit}
        title="문제를 만들지 못했어요"
        body="노트는 그대로 있어요. 잠시 후 다시 시도해 주세요."
        secondary="닫기"
        onSecondary={() => router.back()}
        primary="다시 시도"
        onPrimary={() => router.replace({ pathname: '/play/gen', params: { materialId, title } })}
      />
    </View>
  );
}

export function QuizReadyScreen() {
  const { setId, title } = useLocalSearchParams<{ setId: string; title?: string }>();
  return (
    <Screen
      footer={
        <>
          <Btn onPress={() => router.replace({ pathname: '/play/solve', params: { setId } })}>
            퀴즈 시작하기
          </Btn>
          <Pressable
            onPress={() => router.dismissTo('/(tabs)/quiz')}
            className="mt-2 self-center rounded-full border border-line px-3 py-1"
          >
            <Text className="text-[12px] text-sub">나중에 풀기</Text>
          </Pressable>
        </>
      }
    >
      <View className="items-center pt-40">
        <Animated.View
          entering={ZoomIn}
          className="h-20 w-20 items-center justify-center rounded-full bg-mint"
        >
          <Text className="text-[34px]">✅</Text>
        </Animated.View>
        <Text className="mt-5 text-[17px] font-bold text-ink">총 5문제가 생성됐어요!</Text>
        <Text className="text-[12px] text-sub">
          {title ?? '이차방정식 풀이'} 노트를 기반으로 만들었어요
        </Text>
      </View>
    </Screen>
  );
}

export function QuizSolveScreen() {
  const { setId, from } = useLocalSearchParams<{ setId?: string; from?: string }>();
  const set = useQuery({
    queryKey: ['quiz-set', setId ?? 'latest'],
    queryFn: () => api.quiz.set(setId ?? ''),
  });
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<string | null>(null);
  const [right, setRight] = useState<boolean | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const expired = useAuth((s) => s.expired);
  useEffect(() => {
    if (set.data) api.quiz.startAttempt(set.data._id).then((a) => setAttemptId(a._id));
  }, [set.data?._id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      Speech.stop();
    },
    [],
  );
  if (!set.data) return <Loading />;
  const qs = set.data.questions;
  const q = qs[i];
  if (!q) return <Loading />;
  const speak = () => {
    if (speaking) {
      Speech.stop();
      return setSpeaking(false);
    }
    setSpeaking(true);
    Speech.speak(`${q.prompt}. ${(q.choices ?? []).map((c, n) => `${n + 1}번, ${c}`).join('. ')}`, {
      language: 'ko-KR',
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
    });
  };
  const choose = async (c: string) => {
    if (pick || !attemptId) return;
    setPick(c);
    try {
      const r = await api.quiz.answer(attemptId, q._id, c);
      setRight(r.correct);
      setResults((x) => [...x, r.correct]);
      Haptics.notificationAsync(
        r.correct
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error,
      );
    } catch (e) {
      // 로그인 만료: 풀던 내용은 그대로 두고 다이얼로그 (p.101)
      if (e instanceof ApiError && e.code === ERROR_CODES.TOKEN_EXPIRED)
        useAuth.getState().setExpired(true);
      setPick(null);
    }
  };
  const next = async () => {
    if (i >= qs.length - 1) {
      const r = await api.quiz.finish(attemptId!);
      return router.replace({
        pathname: '/play/review',
        params: { setId: set.data!._id, points: String(r.pointsEarned) },
      });
    }
    setI((x) => x + 1);
    setPick(null);
    setRight(null);
  };
  const retry = () => {
    setPick(null);
    setRight(null);
    setResults((r) => r.slice(0, -1));
  };
  return (
    <View className="flex-1">
      <Screen
        footer={
          pick === null ? (
            <Btn kind="cream" icon={<Volume2 size={16} color={C.ink} />} onPress={speak}>
              {speaking ? '읽어주는 중… (탭해서 멈춤)' : '음성으로 듣기'}
            </Btn>
          ) : right ? (
            <Btn onPress={next}>다음 문제 풀기</Btn>
          ) : right === false ? (
            <View className="gap-2">
              <Btn kind="cream" onPress={retry}>
                다시 풀기
              </Btn>
              <Btn onPress={next}>다음 문제 풀기</Btn>
            </View>
          ) : (
            <Btn loading>채점 중</Btn>
          )
        }
      >
        {from === 'room' && (
          <Pressable onPress={() => router.back()} className="mt-3 flex-row items-center gap-2">
            <ArrowLeft size={16} color={C.ink} />
            <Text className="text-[13px] text-ink">스터디룸으로</Text>
          </Pressable>
        )}
        <Text className="pt-8 text-center text-[12px] text-sub">
          복습 퀴즈 {i + 1} / {qs.length}
        </Text>
        <View className="mt-4">
          <Tutor size={pick === null ? 76 : 70} />
        </View>
        {pick === null || right === null ? (
          <Animated.View entering={FadeIn}>
            <Text className="mt-5 text-[15px] leading-6 font-bold text-ink">{q.prompt}</Text>
            <View className="mt-4 gap-2.5">
              {(q.choices ?? []).map((c, n) => (
                <Pressable
                  key={c}
                  onPress={() => choose(c)}
                  className={cx(
                    'h-12 items-center justify-center rounded-xl border',
                    pick === c ? 'border-brand bg-mint' : 'border-line active:bg-mint',
                  )}
                >
                  <Text className="text-[14px] text-ink">
                    {'①②③④⑤'[n]} {c}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        ) : (
          <Animated.View entering={ZoomIn}>
            <View className={cx('mt-8 rounded-xl py-2.5', right ? 'bg-[#9aa6dd]' : 'bg-danger/10')}>
              <Text
                className={cx(
                  'text-center text-[13px] font-semibold',
                  right ? 'text-white' : 'text-danger',
                )}
              >
                {right ? 'O 정답이에요' : '✕ 오답이에요, 다시 풀어보세요'}
              </Text>
            </View>
            {!right && (
              <Text className="mt-3 text-center text-[12px] text-sub">내가 고른 답: {pick}</Text>
            )}
            <View className="mt-6 flex-row items-center justify-center gap-2">
              <Text className="text-[13px] text-sub">결과</Text>
              {qs.map((_, n) => (
                <View
                  key={n}
                  className={cx(
                    'h-3 w-3 rounded-full',
                    n < results.length ? (results[n] ? 'bg-[#5b74d6]' : 'bg-danger') : 'bg-cream-2',
                  )}
                />
              ))}
            </View>
          </Animated.View>
        )}
      </Screen>
      <Alert
        open={expired}
        title="로그인이 만료됐어요"
        body={`풀던 퀴즈는 저장돼 있어요.\n로그인하면 이어서 풀 수 있어요.`}
        secondary="나중에"
        onSecondary={() => useAuth.getState().setExpired(false)}
        primary="다시 로그인"
        onPrimary={() => {
          useAuth.getState().setExpired(false);
          router.push('/(auth)/login');
        }}
      />
    </View>
  );
}

export function QuizReviewScreen() {
  const { setId, points } = useLocalSearchParams<{ setId?: string; points?: string }>();
  const set = useQuery({
    queryKey: ['quiz-set', setId ?? 'latest'],
    queryFn: () => api.quiz.set(setId ?? ''),
  });
  const qc = useQueryClient();
  const [reward, setReward] = useState(Number(points) > 0);
  const [select, setSelect] = useState(false);
  // 선택 모드에서는 문제 하나를 골라 AI 설명을 본다 (FR-52-01 ~ 05)
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    if (points) qc.invalidateQueries({ queryKey: ['me'] });
  }, [points]); // eslint-disable-line react-hooks/exhaustive-deps
  const qs = set.data?.questions ?? [];
  return (
    <View className="flex-1">
      <Screen
        footer={
          <>
            {select ? (
              <Btn
                disabled={!sel}
                onPress={() =>
                  sel && router.push({ pathname: '/play/explain', params: { qid: sel } })
                }
              >
                AI 설명 보기
              </Btn>
            ) : (
              <Btn onPress={() => router.dismissTo('/(tabs)/quiz')}>확인</Btn>
            )}
            <Pressable
              onPress={() => router.push({ pathname: '/play/similar', params: { setId } })}
              className="mt-2 self-center rounded-full border border-line px-3 py-1"
            >
              <Text className="text-[12px] text-sub">유사 퀴즈 생성하기</Text>
            </Pressable>
          </>
        }
      >
        <View className="items-end pt-3">
          <Pressable
            onPress={() => {
              setSelect((x) => !x);
              setSel(null);
            }}
            className={cx('rounded-full px-3 py-1', select ? 'bg-ink' : 'border border-line')}
          >
            <Text className={cx('text-[12px]', select ? 'text-white' : 'text-ink')}>
              {select ? '취소' : '선택'}
            </Text>
          </Pressable>
        </View>
        <View className="mt-3 rounded-xl bg-mint py-2.5">
          <Text className="text-center text-[13px] font-semibold text-ink">
            🎉 미션 완료! {qs.length}문제를 모두 풀었어요
          </Text>
        </View>
        <View className="mt-3 gap-2">
          {qs.map((q, n) => (
            <Pressable
              key={q._id}
              onPress={() =>
                select
                  ? setSel(q._id)
                  : router.push({ pathname: '/play/explain', params: { qid: q._id } })
              }
              className={cx('rounded-2xl bg-cream p-3', sel === q._id && 'border-2 border-brand')}
            >
              <View className="flex-row items-start gap-2">
                <View className="h-5 w-5 items-center justify-center rounded-full bg-brand">
                  <Text className="text-[10px] text-white">{n + 1}</Text>
                </View>
                <Text className="flex-1 text-[13px] text-ink">Q. {q.prompt}</Text>
              </View>
              <View className="mt-2 rounded-lg bg-mint px-3 py-2">
                <Text className="text-[12px] text-brand">A. {q.answer}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </Screen>
      {reward && (
        <Pressable
          onPress={() => setReward(false)}
          className="absolute inset-0 z-40 items-center justify-center bg-black/55"
        >
          <Tutor size={96} />
          <Text className="mt-4 text-[17px] font-bold text-white">퀴즈 풀기 성공!</Text>
          <Animated.View entering={ZoomIn} className="mt-3 rounded-2xl bg-[#f7f2e6] px-10 py-3">
            <Text className="text-[18px] font-bold text-brand">+{points}P</Text>
          </Animated.View>
          <Text className="mt-6 text-[11px] text-white/60">탭해서 닫기</Text>
        </Pressable>
      )}
    </View>
  );
}

export function QuizExplainScreen() {
  const { qid = 'q3' } = useLocalSearchParams<{ qid?: string }>();
  const box = useQuery({ queryKey: ['quiz-box'], queryFn: api.quiz.box });
  const ex = useQuery({ queryKey: ['explain', qid], queryFn: () => api.quiz.explanation(qid) });
  const q = box.data?.find((x) => x._id === qid);
  return (
    <Screen>
      <Pressable
        onPress={() => router.back()}
        className="mt-3 flex-row items-center gap-2 self-start rounded-full border border-line px-3 py-1.5"
      >
        <ArrowLeft size={16} color={C.ink} />
        <Text className="text-[13px] text-ink">뒤로 가기</Text>
      </Pressable>
      <Text className="mt-4 text-[16px] font-bold text-ink">AI 설명</Text>
      <View className="mt-2 rounded-2xl border border-line">
        <View className="border-b border-ink/80 p-3">
          <Text className="text-[12px] font-semibold text-brand">문제 {q?.order ?? 1}</Text>
          <Text className="text-[14px] text-ink">{q?.prompt}</Text>
        </View>
        <View className="p-3 pt-6">
          {ex.data ? (
            ex.data.text.split('\n').map((l) => (
              <Text
                key={l}
                className={cx('text-[13px] leading-6 text-ink', l.startsWith('•') && 'pl-2')}
              >
                {l}
              </Text>
            ))
          ) : (
            <Loading />
          )}
        </View>
      </View>
    </Screen>
  );
}

export function QuizSimilarScreen() {
  const { setId } = useLocalSearchParams<{ setId?: string }>();
  const sim = useQuery({
    queryKey: ['similar', setId],
    queryFn: () => api.quiz.similar(setId ?? ''),
  });
  const [open, setOpen] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (q: Question) =>
      api.quiz.saveFlashcard({ front: q.prompt, back: q.answer, sourceQuestionId: q._id }),
    onSuccess: (_, q) => {
      setSaved((p) => [...p, q._id]);
      // 플래시 카드 화면을 다시 열면 새 카드가 보이게
      qc.invalidateQueries({ queryKey: ['flashcards'] });
      toast('플래시카드에 저장했어요');
    },
  });
  // 문제를 받으면 첫 문제를 펼친다 (렌더 중 상태 조정)
  const [loaded, setLoaded] = useState<typeof sim.data>();
  if (sim.data && sim.data !== loaded) {
    setLoaded(sim.data);
    if (sim.data.questions[0]) setOpen([sim.data.questions[0]._id]);
  }
  return (
    <Screen footer={<Btn onPress={() => router.back()}>확인</Btn>}>
      <Text className="pt-5 text-[16px] font-bold text-ink">유사 퀴즈 생성</Text>
      <Text className="text-[12px] text-sub">
        원본과 같은 난이도로 {sim.data?.questionCount ?? 3}문제를 새로 만들었어요
      </Text>
      {!sim.data && <Loading />}
      <View className="mt-3 gap-2">
        {sim.data?.questions.map((q, i) => (
          <View key={q._id} className="rounded-2xl border border-line p-3">
            <Text className="text-[12px] font-semibold text-ink">문제 {i + 1}</Text>
            <Text className="text-[13px] text-ink">{q.prompt}</Text>
            {open.includes(q._id) && (
              <Animated.View entering={ZoomIn} className="mt-2 rounded-xl bg-sun/25 px-3 py-2">
                <Text className="text-[12px] font-semibold text-ink">문제 {i + 1} 정답</Text>
                <Text className="text-[12px] text-ink">{q.answer}</Text>
              </Animated.View>
            )}
            <View className="mt-2 flex-row gap-1.5">
              {!open.includes(q._id) && (
                <Pressable
                  onPress={() => setOpen((p) => [...p, q._id])}
                  className="rounded-full bg-mint px-2.5 py-1"
                >
                  <Text className="text-[11px] text-brand">정답 보기</Text>
                </Pressable>
              )}
              <Pressable
                disabled={saved.includes(q._id)}
                onPress={() => save.mutate(q)}
                className="rounded-full bg-mint px-2.5 py-1"
              >
                <Text className="text-[11px] text-brand">
                  {saved.includes(q._id) ? '✓ 저장됨' : '플래시카드 저장'}
                </Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

export function FlashScreen() {
  const { i: start } = useLocalSearchParams<{ i?: string }>();
  const cards = useQuery({ queryKey: ['flashcards'], queryFn: api.quiz.flashcards });
  const [i, setI] = useState(Number(start ?? 0));
  const [back, setBack] = useState(true);
  const list = cards.data ?? [];
  const c = list[i];
  return (
    <Screen footer={<Btn onPress={() => router.push('/play/cards')}>펼쳐보기</Btn>}>
      <Pressable
        onPress={() => router.back()}
        className="mt-3 flex-row items-center gap-2 self-start rounded-full border border-line px-3 py-1.5"
      >
        <ArrowLeft size={16} color={C.ink} />
        <Text className="text-[13px] text-ink">뒤로 가기</Text>
      </Pressable>
      {c && (
        <View className="-mx-5 mt-10 bg-mint/70 px-8 py-1">
          <Pressable
            onPress={() => setBack((b) => !b)}
            className="h-72 items-center justify-center rounded-2xl border border-brand/30 bg-white px-6"
          >
            <Animated.Text
              key={`${i}-${back}`}
              entering={FadeIn}
              className="text-center text-[16px] leading-6 font-bold text-ink"
            >
              {back ? c.back : c.front}
            </Animated.Text>
            <Text className="absolute bottom-4 text-[11px] text-sub">탭하여 뒤집기</Text>
          </Pressable>
        </View>
      )}
      <View className="mt-4 flex-row items-center justify-center gap-4">
        <Pressable
          disabled={i === 0}
          onPress={() => {
            setI((x) => x - 1);
            setBack(true);
          }}
          className={i === 0 ? 'opacity-30' : ''}
        >
          <Text className="text-[13px] text-sub">‹ 이전</Text>
        </Pressable>
        <Text className="text-[13px] text-sub">
          {i + 1} / {list.length}
        </Text>
        <Pressable
          disabled={i >= list.length - 1}
          onPress={() => {
            setI((x) => x + 1);
            setBack(true);
          }}
          className={i >= list.length - 1 ? 'opacity-30' : ''}
        >
          <Text className="text-[13px] text-sub">다음 ›</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

export function CardsScreen() {
  const qc = useQueryClient();
  const cards = useQuery({ queryKey: ['flashcards'], queryFn: api.quiz.flashcards });
  const [select, setSelect] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const del = useMutation({
    mutationFn: () => api.quiz.deleteFlashcards(sel),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flashcards'] });
      toast(`${sel.length}장을 삭제했어요`);
      setSel([]);
      setSelect(false);
    },
  });
  return (
    <Screen
      footer={
        select &&
        sel.length > 0 && (
          <Btn
            kind="danger"
            loading={del.isPending}
            onPress={() => del.mutate()}
          >{`${sel.length}장 삭제`}</Btn>
        )
      }
    >
      <View className="mt-3 flex-row items-center justify-between">
        <Pressable
          onPress={() => router.back()}
          className="flex-row items-center gap-2 rounded-full border border-line px-3 py-1.5"
        >
          <ArrowLeft size={16} color={C.ink} />
          <Text className="text-[13px] text-ink">뒤로 가기</Text>
        </Pressable>
        <Pressable
          onPress={() => setSelect((x) => !x)}
          className={cx('rounded-full px-3 py-1', select ? 'bg-ink' : 'border border-line')}
        >
          <Text className={cx('text-[12px]', select ? 'text-white' : 'text-ink')}>
            {select ? '취소' : '선택'}
          </Text>
        </Pressable>
      </View>
      <View className="mt-4 flex-row flex-wrap justify-between gap-y-3">
        {cards.data?.map((c, i) => (
          <Pressable
            key={c._id}
            onPress={() =>
              select
                ? setSel((p) => (p.includes(c._id) ? p.filter((x) => x !== c._id) : [...p, c._id]))
                : router.replace({ pathname: '/play/flash', params: { i: String(i) } })
            }
            className={cx(
              'h-36 w-[48.5%] items-center justify-center rounded-2xl border bg-mint p-3',
              sel.includes(c._id) ? 'border-2 border-brand' : 'border-line',
            )}
          >
            <Text className="text-center text-[13px] font-semibold text-ink">{c.front}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

export function QuizBoxScreen() {
  const box = useQuery({ queryKey: ['quiz-box'], queryFn: api.quiz.box });
  const [shown, setShown] = useState<string[]>([]);
  const [select, setSelect] = useState(false);
  // 보관함을 불러오면 첫 퀴즈의 정답을 펼친다 (렌더 중 상태 조정)
  const [loaded, setLoaded] = useState<typeof box.data>();
  if (box.data && box.data !== loaded) {
    setLoaded(box.data);
    if (box.data[0]) setShown([box.data[0]._id]);
  }
  return (
    <Screen footer={<Btn onPress={() => router.back()}>확인</Btn>}>
      <View className="flex-row items-center justify-between pt-5">
        <Text className="text-[16px] font-bold text-ink">퀴즈 보관함</Text>
        <Pressable
          onPress={() => setSelect((x) => !x)}
          className={cx('rounded-full px-3 py-1', select ? 'bg-ink' : 'border border-line')}
        >
          <Text className={cx('text-[12px]', select ? 'text-white' : 'text-ink')}>
            {select ? '완료' : '선택'}
          </Text>
        </Pressable>
      </View>
      <View className="mt-3 gap-2">
        {box.data?.map((q, n) => (
          <View key={q._id} className="rounded-2xl bg-cream p-3">
            <View className="flex-row items-start gap-2">
              <View className="h-5 w-5 items-center justify-center rounded-full bg-brand">
                <Text className="text-[10px] text-white">{n + 1}</Text>
              </View>
              <Text className="flex-1 text-[13px] text-ink">Q. {q.prompt}</Text>
            </View>
            {shown.includes(q._id) && (
              <Animated.View entering={ZoomIn} className="mt-2 rounded-lg bg-mint px-3 py-2">
                <Text className="text-[12px] text-brand">A. {q.answer}</Text>
              </Animated.View>
            )}
            <View className="mt-2 flex-row gap-1.5 pl-7">
              {!shown.includes(q._id) && (
                <Pressable
                  onPress={() => setShown((p) => [...p, q._id])}
                  className="rounded-full bg-mint px-2.5 py-1"
                >
                  <Text className="text-[11px] text-brand">정답 보기</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => router.push({ pathname: '/play/explain', params: { qid: q._id } })}
                className="rounded-full bg-mint px-2.5 py-1"
              >
                <Text className="text-[11px] text-brand">AI 설명 보기</Text>
              </Pressable>
              {select && <Badge tone="gray">선택</Badge>}
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}
