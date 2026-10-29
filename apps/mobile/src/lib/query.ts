import { QueryClient } from '@tanstack/react-query';
import { ApiError, NetworkError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // 연결 문제는 자동 재시도, 서버가 거절한 요청은 다시 보내지 않는다 (p.97)
      retry: (n, e) => e instanceof NetworkError && n < 3,
    },
    mutations: { retry: (n, e) => e instanceof NetworkError && n < 2 && !(e instanceof ApiError) },
  },
});
