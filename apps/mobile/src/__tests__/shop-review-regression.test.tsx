import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { ShopScreen, PointsScreen, BoxScreen } from '../features/reward/shop';
import { api, NetworkError } from '../lib/api';
import { renderScreen, setParams } from '../test-utils';

jest.mock('../lib/env', () => ({ env: { useMock: true, apiUrl: 'http://api' } }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
it('포인트 필터는 적립과 사용을 실제 조회하고 가짜 더보기는 없다', async () => {
  const ledger = jest.spyOn(api.shop, 'ledger');
  await renderScreen(<PointsScreen />, client());
  await fireEvent.press(screen.getByText('적립'));
  await waitFor(() => expect(ledger).toHaveBeenCalledWith('earn'));
  await fireEvent.press(screen.getByText('사용'));
  await waitFor(() => expect(ledger).toHaveBeenCalledWith('spend'));
  expect(screen.queryByText('이전 내역 더 보기')).toBeNull();
});
it('구매 응답 유실은 재구매하지 않고 소유 상태와 잔액, 내역을 다시 확인한다', async () => {
  const qc = client();
  const me = await api.me.get();
  jest.spyOn(api.me, 'get').mockResolvedValue({ ...me, pointBalance: 100000 });
  const items = await api.shop.items({ sort: 'price' });
  const cheap = items.find((i) => i.price > 0)!;
  const buy = jest.spyOn(api.shop, 'purchase').mockRejectedValue(new NetworkError('lost response'));
  const myItems = jest.spyOn(api.shop, 'myItems');
  const ledger = jest.spyOn(api.shop, 'ledger');
  await renderScreen(<ShopScreen />, qc);
  await fireEvent.press((await screen.findAllByText(cheap.name))[0]!);
  await fireEvent.press(screen.getByText('구매'));
  await fireEvent.press(screen.getAllByText('구매').at(-1)!);
  expect(await screen.findByText('구매 결과를 확인해주세요')).toBeTruthy();
  expect(screen.queryByText(/포인트는 차감되지 않았어요/)).toBeNull();
  const before = myItems.mock.calls.length;
  await fireEvent.press(screen.getByText('구매 결과 확인'));
  await waitFor(() => expect(myItems.mock.calls.length).toBeGreaterThan(before));
  expect(ledger).toHaveBeenCalled();
  expect(buy).toHaveBeenCalledTimes(1);
});
it('보유하지 않은 장착 파라미터는 장착 화면을 열지 않는다', async () => {
  const all = await api.shop.items({});
  jest.spyOn(api.shop, 'myItems').mockResolvedValue([]);
  setParams({ equip: all.find((i) => i.price > 0)!._id });
  await renderScreen(<BoxScreen />, client());
  await screen.findByText('아직 보유한 아이템이 없어요');
  expect(screen.queryByText('장착하기')).toBeNull();
});
it('보유한 아이템 장착은 API와 보관함 갱신을 수행한다', async () => {
  const all = await api.shop.items({});
  const it = all.find((i) => i.price > 0)!;
  jest
    .spyOn(api.shop, 'myItems')
    .mockResolvedValue([
      { itemId: it._id, isOwned: true, isWished: false, isEquipped: false },
    ] as never);
  const equip = jest.spyOn(api.shop, 'equip').mockResolvedValue(undefined);
  const qc = client();
  const invalid = jest.spyOn(qc, 'invalidateQueries');
  setParams({ equip: it._id });
  await renderScreen(<BoxScreen />, qc);
  await fireEvent.press(await screen.findByText('장착하기'));
  await waitFor(() => expect(equip).toHaveBeenCalledWith(it._id));
  expect(invalid).toHaveBeenCalledWith({ queryKey: ['my-items'] });
});
