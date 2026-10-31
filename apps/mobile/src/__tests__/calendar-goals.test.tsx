import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { RepeatGoalScreen, validYmd } from '../features/progress/goals';
import { TimetableScreen } from '../features/calendar/screens';
import { api } from '../lib/api';
import { renderScreen, setParams } from '../test-utils';

jest.mock('../lib/env', () => ({ env: { useMock: true, apiUrl: 'http://api' } }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

// PR #35 리뷰
describe('날짜 입력', () => {
  it('있는 날짜만 받는다', () => {
    expect(validYmd('2026-12-24')).toBe(true);
    expect(validYmd('2026-02-30')).toBe(false);
    expect(validYmd('2026-1-5')).toBe(false);
    expect(validYmd('')).toBe(false);
  });
});

describe('반복 목표', () => {
  it('요일을 모두 빼면 저장을 막고 안내한다', async () => {
    const [goal] = await api.study.recurringGoals();
    setParams({ id: goal!._id });
    const save = jest.spyOn(api.study, 'saveRecurringGoal');
    await renderScreen(<RepeatGoalScreen />);
    await screen.findByDisplayValue(goal!.name);
    expect(screen.queryByText('요일을 선택해주세요')).toBeNull();
    // 고른 요일을 모두 끈다
    for (const d of ['월', '화', '수', '목', '금', '토', '일']) {
      const box = screen.getByLabelText(`${d}요일`);
      if (box.props.accessibilityState?.checked) await fireEvent.press(box);
    }
    expect(await screen.findByText('요일을 선택해주세요')).toBeTruthy();
    await fireEvent.press(screen.getByText('저장하기'));
    expect(save).not.toHaveBeenCalled();
  });

  it('id 없이 열면 새 목표다', async () => {
    setParams({});
    await renderScreen(<RepeatGoalScreen />);
    expect(screen.getByPlaceholderText('매일 30분 영어 단어 암기').props.value).toBe('');
    expect(screen.queryByText('목표 삭제')).toBeNull();
  });
});

describe('시간표 공유', () => {
  it('아무도 고르지 않은 채로 열리고, 고른 친구만 보낸다', async () => {
    const share = jest.spyOn(api.timetable, 'share');
    const friends = await api.social.friends();
    await renderScreen(<TimetableScreen />);
    await fireEvent.press(await screen.findByText('공유'));
    expect(await screen.findByText('0명에게 공유하기')).toBeTruthy();
    await fireEvent.press(await screen.findByText(friends[0]!.nickname));
    await fireEvent.press(screen.getByText('1명에게 공유하기'));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith(
        expect.objectContaining({ friendIds: [friends[0]!.userId] }),
      ),
    );
  });
});

describe('시간표 시간 검증', () => {
  it('존재하지 않는 시각이면 수업을 저장하지 않는다', async () => {
    const add = jest.spyOn(api.timetable, 'addClass');
    await renderScreen(<TimetableScreen />);
    await fireEvent.press(await screen.findByText('+ 수업 추가'));
    await fireEvent.changeText(screen.getByDisplayValue('10:00'), '25:70');
    await fireEvent.changeText(screen.getByDisplayValue('11:30'), '99:99');
    await fireEvent.press(screen.getByText('추가하기'));
    await act(async () => {});
    expect(add).not.toHaveBeenCalled();
  });
});
