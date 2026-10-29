// EXPO_PUBLIC_* 값은 빌드할 때 번들에 들어간다 (.env.example 참고). 비밀값은 넣지 않는다.
const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1').replace(
  /\/$/,
  '',
);

export const env = {
  useMock: process.env.EXPO_PUBLIC_USE_MOCK !== 'false',
  /** 메인 API 주소 (/api/v1 포함) */
  apiUrl,
  /** Socket.IO는 같은 서버의 루트에 붙는다 */
  socketUrl: process.env.EXPO_PUBLIC_SOCKET_URL || apiUrl.replace(/\/api\/v\d+$/, ''),
};
