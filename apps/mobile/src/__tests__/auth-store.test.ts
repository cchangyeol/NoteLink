import type { User } from '@notelink/shared';
import { useAuth } from '../stores/auth';

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));

const tokens = { accessToken: 'a', refreshToken: 'r' };
const user = (id: string) => ({ _id: id }) as User;

// 다른 계정으로 로그인하면 이전 계정의 온보딩 상태를 이어 가지 않는다
describe('auth mockStore', () => {
  beforeEach(async () => {
    mockStore.clear();
    useAuth.setState({ tokens: null, user: null, userId: null, onboarded: false });
  });

  it('같은 계정으로 다시 로그인하면 온보딩 완료를 유지한다', async () => {
    await useAuth.getState().signIn(tokens, user('u1'));
    await useAuth.getState().finishOnboarding();
    await useAuth.getState().load();
    await useAuth.getState().signIn(tokens, user('u1'));
    expect(useAuth.getState().onboarded).toBe(true);
  });

  it('다른 계정으로 로그인하면 온보딩을 다시 한다', async () => {
    await useAuth.getState().signIn(tokens, user('u1'));
    await useAuth.getState().finishOnboarding();
    await useAuth.getState().load();
    expect(useAuth.getState().userId).toBe('u1');
    await useAuth.getState().signIn(tokens, user('u2'));
    expect(useAuth.getState().onboarded).toBe(false);
    expect(JSON.parse(mockStore.get('notelink.auth')!)).toMatchObject({
      userId: 'u2',
      onboarded: false,
    });
  });
});
