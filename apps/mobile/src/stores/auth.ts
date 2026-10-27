import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { User } from '@notelink/shared';

// 토큰은 SecureStore(키체인 · 키스토어)에만 둔다
const KEY = 'notelink.auth';

type Saved = { accessToken: string; refreshToken: string };
type Auth = {
  ready: boolean;
  tokens: Saved | null;
  user: User | null;
  /** 기기에 저장된 토큰의 주인. 다른 계정으로 로그인하면 이전 상태를 버린다 */
  userId: string | null;
  onboarded: boolean;
  /** 로그인 만료 다이얼로그 (p.101) */
  expired: boolean;
  load: () => Promise<void>;
  signIn: (t: Saved, user: User) => Promise<void>;
  setUser: (u: User) => void;
  setTokens: (t: Saved) => Promise<void>;
  setExpired: (v: boolean) => void;
  finishOnboarding: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuth = create<Auth>((set, get) => ({
  ready: false,
  tokens: null,
  user: null,
  userId: null,
  onboarded: false,
  expired: false,
  load: async () => {
    const raw = await SecureStore.getItemAsync(KEY);
    const saved = raw
      ? (JSON.parse(raw) as Saved & { onboarded?: boolean; userId?: string })
      : null;
    set({
      ready: true,
      tokens: saved?.accessToken
        ? { accessToken: saved.accessToken, refreshToken: saved.refreshToken }
        : null,
      userId: saved?.userId ?? null,
      onboarded: !!saved?.onboarded,
    });
  },
  signIn: async (tokens, user) => {
    // 온보딩 완료 여부는 같은 계정일 때만 이어 간다
    const onboarded = get().userId === user._id && get().onboarded;
    await SecureStore.setItemAsync(KEY, JSON.stringify({ ...tokens, onboarded, userId: user._id }));
    set({ tokens, user, userId: user._id, onboarded, expired: false });
  },
  setUser: (user) => set({ user }),
  setTokens: async (tokens) => {
    const { onboarded, userId } = get();
    await SecureStore.setItemAsync(KEY, JSON.stringify({ ...tokens, onboarded, userId }));
    set({ tokens });
  },
  setExpired: (expired) => set({ expired }),
  finishOnboarding: async () => {
    set({ onboarded: true });
    const t = get().tokens;
    await SecureStore.setItemAsync(
      KEY,
      JSON.stringify({ ...(t ?? {}), onboarded: true, userId: get().userId }),
    );
  },
  signOut: async () => {
    await SecureStore.deleteItemAsync(KEY);
    set({ tokens: null, user: null, userId: null, onboarded: false });
  },
}));
