import { ERROR_CODES, PATHS, type ApiErr } from '@notelink/shared';
import { env } from '../env';
import { useAuth } from '@/stores/auth';
import { useNet } from '@/stores/net';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export class NetworkError extends Error {}

type Opts = {
  query?: Record<string, string | number | boolean | undefined>;
  auth?: boolean;
  retry?: boolean;
};

let refreshing: Promise<boolean> | null = null;

/** 액세스 토큰이 만료되면 한 번만 갱신하고 원래 요청을 다시 보낸다 */
async function refresh(): Promise<boolean> {
  const t = useAuth.getState().tokens;
  if (!t) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(env.apiUrl + PATHS.refresh, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: t.refreshToken }),
      });
      if (!res.ok) return false;
      const { data } = (await res.json()) as {
        data: { accessToken: string; refreshToken: string };
      };
      // 갱신하는 동안 로그아웃하거나 다른 계정으로 로그인했으면 이 응답은 버린다
      if (useAuth.getState().tokens !== t) return false;
      await useAuth.getState().setTokens(data);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null));
    }
  })();
  return refreshing;
}

export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: Opts = {},
): Promise<T> {
  const qs = opts.query
    ? '?' +
      Object.entries(opts.query)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  const token = useAuth.getState().tokens?.accessToken;
  let res: Response;
  try {
    res = await fetch(env.apiUrl + path + qs, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && opts.auth !== false && { Authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // 연결 실패 — 배너로 알리고 호출한 쪽에서 대기열/재시도 처리 (p.97)
    useNet.getState().set('unstable');
    throw new NetworkError('network');
  }
  if (useNet.getState().state === 'unstable' || useNet.getState().state === 'offline')
    useNet.getState().set('ok');

  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as { data?: T } & Partial<ApiErr>;
  if (res.ok) return json.data as T;

  const code = json.code ?? 'UNKNOWN';
  if (res.status === 401 && code === ERROR_CODES.TOKEN_EXPIRED && opts.retry !== false) {
    if (await refresh()) return request<T>(method, path, body, { ...opts, retry: false });
    useAuth.getState().setExpired(true);
  }
  if (code === ERROR_CODES.MAINTENANCE) useNet.getState().set('maintenance');
  if (code === ERROR_CODES.AI_MAINTENANCE) useNet.getState().set('aiMaintenance');
  throw new ApiError(code, json.message ?? '문제가 생겼어요', res.status);
}

export const http = {
  get: <T>(p: string, query?: Opts['query']) => request<T>('GET', p, undefined, { query }),
  post: <T>(p: string, body?: unknown) => request<T>('POST', p, body ?? {}),
  patch: <T>(p: string, body: unknown) => request<T>('PATCH', p, body),
  put: <T>(p: string, body: unknown) => request<T>('PUT', p, body),
  del: <T = void>(p: string) => request<T>('DELETE', p),
};
