import type { QueryClient } from '@tanstack/react-query';
import { disconnectSocket } from '@/lib/socket';
import { useDraft } from '@/stores/draft';
import { useSession } from '@/stores/session';

/** 로그아웃 · 다른 계정 로그인 때 이전 계정이 남긴 기기 상태를 버린다 */
export function clearAccountState(qc: QueryClient) {
  disconnectSocket();
  qc.clear();
  useSession.getState().reset();
  useDraft.getState().reset();
}
