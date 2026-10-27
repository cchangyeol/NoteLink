import { create } from 'zustand';
import { api } from '@/lib/api';

// 순공시간 측정 상태. 타이머는 기기에서 돈다 (p.48) — 시작 시각만 기억하고 경과는 매번 계산하므로
// 앱이 백그라운드로 가도 시간이 어긋나지 않는다.

export const AUTO_END_MS = 10 * 60 * 1000; // 쉬는 중 10분이 지나면 자동 종료 (p.48)

type Session = {
  itemId: string | null;
  sessionId: string | null;
  /** 측정 시작(또는 재개) 시각 */
  since: number | null;
  /** 이번 세션에서 이미 쌓인 초 (일시정지 전까지) */
  banked: number;
  pausedAt: number | null;
  mode: 'personal' | 'auto_landscape';
  start: (itemId: string, mode?: Session['mode']) => Promise<void>;
  pause: () => void;
  resume: () => void;
  /** 세션을 끝내고 쌓인 초를 돌려준다 */
  end: (reason: string) => Promise<{ sec: number; pointsEarned: number }>;
  elapsed: (now?: number) => number;
  /** 로그아웃 · 계정 전환 때 서버에 알리지 않고 기기 상태만 비운다 */
  reset: () => void;
};

const idle = { itemId: null, sessionId: null, since: null, banked: 0, pausedAt: null };

export const useSession = create<Session>((set, get) => ({
  ...idle,
  mode: 'personal',
  reset: () => set({ ...idle, mode: 'personal' }),
  elapsed: (now = Date.now()) => {
    const s = get();
    return s.banked + (s.since ? Math.floor((now - s.since) / 1000) : 0);
  },
  start: async (itemId, mode = 'personal') => {
    const cur = get();
    if (cur.itemId === itemId && cur.pausedAt) return get().resume();
    if (cur.itemId && cur.itemId !== itemId) await get().end('switch');
    set({ itemId, since: Date.now(), banked: 0, pausedAt: null, mode, sessionId: null });
    const s = await api.study.startSession({ studyItemId: itemId, mode });
    set({ sessionId: s._id });
  },
  pause: () => {
    const s = get();
    if (!s.since) return;
    set({ banked: s.elapsed(), since: null, pausedAt: Date.now() });
    if (s.sessionId) api.study.pauseSession(s.sessionId).catch(() => {});
  },
  resume: () => {
    const s = get();
    set({ since: Date.now(), pausedAt: null });
    if (s.sessionId) api.study.resumeSession(s.sessionId).catch(() => {});
  },
  end: async (reason) => {
    const s = get();
    const sec = s.elapsed();
    set(idle);
    if (!s.sessionId) return { sec, pointsEarned: 0 };
    // 서버가 잰 시간을 기준으로 삼는다 (기기 시계 조작으로 포인트를 받지 못하게)
    const r = await api.study.endSession(s.sessionId, {
      clientDurationSec: sec,
      endReason: reason,
    });
    return { sec: r.durationSec, pointsEarned: r.pointsEarned };
  },
}));
