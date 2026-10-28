import { act, fireEvent, screen } from '@testing-library/react-native';
import { FriendAddScreen, ChatScreen } from '../features/social/screens';
import { useAuth } from '../stores/auth';
import { renderScreen, setParams } from '../test-utils';

const mockApi = {
  social: {
    search: jest.fn(),
    sendRequest: jest.fn(async () => {}),
    openDirect: jest.fn(async () => ({ _id: 'room1' })),
    messages: jest.fn(),
  },
};
jest.mock('../lib/api', () => ({
  get api() {
    return mockApi;
  },
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

const user = (id: string, nickname: string) => ({
  userId: id,
  nickname,
  handle: `@${id}`,
  mutualCount: 0,
});

// PR #33 리뷰
describe('친구 추가', () => {
  it('검색된 사람 모두에게 요청을 보낼 수 있다', async () => {
    mockApi.social.search.mockResolvedValue([user('u1', '지우'), user('u2', '지민')]);
    await renderScreen(<FriendAddScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText('닉네임을 입력해주세요.'), '지');
    expect(await screen.findByText('지민')).toBeTruthy();
    expect(screen.getByText('검색 결과 2')).toBeTruthy();
    const buttons = screen.getAllByText('친구 요청 보내기');
    expect(buttons).toHaveLength(2);
    await fireEvent.press(buttons[1]!);
    await act(async () => {});
    expect(mockApi.social.sendRequest).toHaveBeenCalledWith('u2');
    expect(await screen.findByText('요청 보냄')).toBeTruthy();
    expect(screen.getAllByText('친구 요청 보내기')).toHaveLength(1);
  });
});

describe('1:1 채팅', () => {
  it('로그인한 사용자 ID로 내 메시지를 가린다', async () => {
    useAuth.setState({ userId: '665f0c1a2b3c4d5e6f708192' });
    setParams({ id: 'u1', name: '지우' });
    mockApi.social.messages.mockResolvedValue([
      {
        _id: 'm1',
        chatRoomId: 'room1',
        senderId: '665f0c1a2b3c4d5e6f708192',
        text: '내가 보낸 말',
        createdAt: '2026-10-27T00:00:00.000Z',
      },
      {
        _id: 'm2',
        chatRoomId: 'room1',
        senderId: 'u1',
        text: '친구가 보낸 말',
        createdAt: '2026-10-27T00:01:00.000Z',
      },
    ]);
    await renderScreen(<ChatScreen />);
    const mine = await screen.findByText('내가 보낸 말');
    const theirs = screen.getByText('친구가 보낸 말');
    expect(mine.props.className).toContain('text-white');
    expect(theirs.props.className).toContain('text-ink');
  });
});
