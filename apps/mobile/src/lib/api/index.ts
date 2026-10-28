import { env } from '../env';
import { mockApi } from '../mock/api';
import { httpApi } from './http-api';
import type { Api } from './types';

/** 화면은 이 객체만 쓴다. EXPO_PUBLIC_USE_MOCK=false면 NestJS 메인 API로 바로 붙는다. */
export const api: Api = env.useMock ? mockApi : httpApi;
export { ApiError, NetworkError } from './http';
export type * from './types';
