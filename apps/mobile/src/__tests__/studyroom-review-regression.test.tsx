import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import * as Calendar from 'expo-calendar';
import type { Message } from '@notelink/shared';
import { api } from '../lib/api';
import { RoomScreen } from '../features/studyroom/room';
import { TimerScreen, ScheduleScreen } from '../features/studyroom/tools';
import { socket, mockServer } from '../lib/socket';
import { useNet } from '../stores/net';
import { renderScreen, setParams } from '../test-utils';

jest.mock('../lib/env', () => ({ env: { useMock: true, apiUrl: 'http://api' } }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));
jest.mock('expo-file-system', () => ({ UploadType: { BINARY_CONTENT: 0 }, File: jest.fn() }));
jest.mock('expo-calendar', () => ({
  requestCalendarPermissionsAsync: jest.fn(async () => ({ granted: true })),
  createEventInCalendarAsync: jest.fn(async () => ({ action: 'saved' })),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {},
}));

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});
it('타이머 활성화만 바꿔도 기존 반복과 교시표를 보존한다', async () => {
  const [brief] = await api.rooms.recommended();
  const full = await api.rooms.get(brief!._id);
  const periods = [{ start: '14:00', end: '14:40', label: '개별 수업' }];
  jest.spyOn(api.rooms, 'get').mockResolvedValue({
    ...full,
    timerRule: { enabled: true, type: 'period', focusMin: 25, breakMin: 5, repeat: 7, periods },
  });
  const save = jest.spyOn(api.rooms, 'setTimer').mockResolvedValue(full);
  setParams({ id: full._id });
  await renderScreen(<TimerScreen />, client());
  await waitFor(() => expect(screen.getByLabelText('방 시간 규칙').props.value).toBe(true));
  await fireEvent(screen.getByLabelText('방 시간 규칙'), 'valueChange', false);
  await fireEvent.press(screen.getByText('저장하기'));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      full._id,
      expect.objectContaining({ enabled: false, repeat: 7, periods }),
    ),
  );
});
it.each(['월', '화', '수', '목', '금', '토', '일'])(
  '%s요일 일정을 서울 시각으로 만든다',
  async (day) => {
    const [brief] = await api.rooms.recommended();
    jest.spyOn(api.rooms, 'schedule').mockResolvedValue({
      members: [],
      grid: [],
      startHour: 9,
      matches: [{ day, label: `${day}요일`, start: '09:00', end: '10:00' }],
    });
    setParams({ id: brief!._id });
    await renderScreen(<ScheduleScreen />, client());
    await screen.findByText(brief!.title);
    await waitFor(() => expect(screen.getAllByText(/09:00/).length).toBeGreaterThan(0));
    await fireEvent.press(screen.getByText('캘린더'));
    await waitFor(() => expect(Calendar.createEventInCalendarAsync).toHaveBeenCalled());
    const event = jest.mocked(Calendar.createEventInCalendarAsync).mock.calls[0]![0]!;
    const start = new Date(event.startDate!);
    expect(new Date(start.getTime() + 9 * 3600000).getUTCDay()).toBe(
      ['일', '월', '화', '수', '목', '금', '토'].indexOf(day),
    );
    expect(start.toISOString().slice(11, 16)).toBe('00:00');
  },
);
it('기록을 기다리는 동안 쓴 대기 메시지는 늦은 기록에도 남고 재연결 때 방을 다시 구독한다', async () => {
  const [brief] = await api.rooms.recommended();
  const chatRoomId = await api.rooms.chatRoomId(brief!._id);
  let resolve!: (m: Message[]) => void;
  jest.spyOn(api.social, 'messages').mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const emit = jest.spyOn(socket, 'emit');
  useNet.setState({ state: 'ok' });
  setParams({ id: brief!._id });
  await renderScreen(<RoomScreen />, client());
  await screen.findByText(brief!.title);
  await waitFor(() => expect(resolve).toBeDefined());
  const input = screen.getByPlaceholderText('채팅을 입력하는 중입');
  await fireEvent(input, 'focus');
  await act(async () => useNet.getState().set('unstable'));
  await fireEvent.changeText(input, '기록보다 먼저 쓴 말');
  await fireEvent(input, 'submitEditing');
  await act(async () => resolve([message(chatRoomId, 'late-history', '늦게 조회된 과거 기록')]));
  await screen.findByText('늦게 조회된 과거 기록');
  expect(screen.getByText('기록보다 먼저 쓴 말')).toBeTruthy();
  const joins = emit.mock.calls.filter((c) => c[0] === 'room:join').length;
  await act(async () => useNet.getState().set('ok'));
  await waitFor(() =>
    expect(emit.mock.calls.filter((c) => c[0] === 'room:join').length).toBeGreaterThan(joins),
  );
});

const message = (chatRoomId: string, id: string, text: string): Message => ({
  _id: id,
  chatRoomId,
  senderId: 'friend-review',
  senderNickname: '친구',
  type: 'text',
  text,
  sharedItemId: null,
  createdAt: '2026-10-31T00:00:00.000Z',
});

it('재연결은 방과 기록을 다시 조회하고 소켓 누락 기록을 ID로 한 번만 표시한다', async () => {
  const [brief] = await api.rooms.recommended();
  const full = await api.rooms.get(brief!._id);
  const chatRoomId = await api.rooms.chatRoomId(full._id);
  const existing = message(chatRoomId, 'old-message', '연결 전 대화');
  const missed = message(chatRoomId, 'missed-message', '연결 중 누락된 대화');
  const refreshed = {
    ...full,
    members: full.members.map((m, i) => (i === 0 ? { ...m, nickname: '재조회된 멤버' } : m)),
  };
  const getRoom = jest
    .spyOn(api.rooms, 'get')
    .mockResolvedValueOnce(full)
    .mockResolvedValue(refreshed);
  const getMessages = jest
    .spyOn(api.social, 'messages')
    .mockResolvedValueOnce([existing])
    .mockResolvedValue([existing, missed]);
  const emit = jest.spyOn(socket, 'emit');
  useNet.setState({ state: 'ok' });
  setParams({ id: full._id });
  await renderScreen(<RoomScreen />, client());
  await screen.findByText(full.title);
  await fireEvent(screen.getByPlaceholderText('채팅을 입력하는 중입'), 'focus');
  await screen.findByText(existing.text!);
  const initialJoins = emit.mock.calls.filter((call) => call[0] === 'room:join').length;
  await act(async () => useNet.getState().set('unstable'));
  await act(async () => useNet.getState().set('ok'));
  await waitFor(() => {
    expect(getRoom.mock.calls.length).toBeGreaterThan(1);
    expect(getMessages.mock.calls.length).toBeGreaterThan(1);
    expect(emit.mock.calls.filter((call) => call[0] === 'room:join').length).toBeGreaterThan(
      initialJoins,
    );
  });
  await screen.findByText('재조회된 멤버');
  await screen.findByText(missed.text!);
  const rejoin = emit.mock.calls.filter((call) => call[0] === 'room:join').at(-1)!;
  const acknowledge = rejoin[2] as (response: { ok: boolean; missed: Message[] }) => void;
  await act(async () => {
    acknowledge({ ok: true, missed: [existing, missed, missed] });
    mockServer.push('chat:message', missed);
  });
  expect(screen.getAllByText(existing.text!)).toHaveLength(1);
  expect(screen.getAllByText(missed.text!)).toHaveLength(1);
});
