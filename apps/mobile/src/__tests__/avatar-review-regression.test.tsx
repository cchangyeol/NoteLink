import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  AvatarCustomScreen,
  PhotoGenScreen,
  PhotoScreen,
  PhotoStyleScreen,
} from '../features/profile/avatar';
import { api } from '../lib/api';
import { uploadToBlob } from '../lib/upload';
import { renderScreen, setParams } from '../test-utils';

jest.mock('../lib/env', () => ({ env: { useMock: true, apiUrl: 'http://api' } }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('../lib/upload', () => ({
  uploadToBlob: jest.fn(async () => 'https://blob/profile.jpg'),
}));
jest.mock('expo-image-picker', () => ({
  CameraType: { front: 'front' },
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('../stores/toast', () => ({ toast: jest.fn() }));
const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});
it('canceled 작업은 한 번 복귀한다', async () => {
  Object.assign(router, { dismissTo: jest.fn() });
  jest.spyOn(api.ai, 'job').mockResolvedValue({ _id: 'cancel', status: 'canceled' } as never);
  setParams({ jobId: 'cancel' });
  await renderScreen(<PhotoGenScreen />, qc());
  await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/profile'));
  expect(router.dismissTo).toHaveBeenCalledTimes(1);
});
it('조회 오류에서 재시도하거나 돌아갈 수 있다', async () => {
  Object.assign(router, { dismissTo: jest.fn() });
  jest.spyOn(api.ai, 'job').mockRejectedValue(new Error('404'));
  setParams({ jobId: 'missing' });
  await renderScreen(<PhotoGenScreen />, qc());
  expect(await screen.findByText('작업 상태를 확인하지 못했어요')).toBeTruthy();
  await fireEvent.press(screen.getByText('돌아가기'));
  expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/profile');
});
it('아바타 저장 실패는 안내하고 성공한 뒤 존재하는 프로필로 복귀한다', async () => {
  const { toast } = jest.requireMock('../stores/toast');
  Object.assign(router, { dismissTo: jest.fn() });
  const save = jest
    .spyOn(api.me, 'saveAvatar')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(undefined);
  setParams({ style: 'nice' });
  await renderScreen(<AvatarCustomScreen />, qc());
  await fireEvent.press(screen.getByText('아바타 선택하기'));
  await waitFor(() =>
    expect(toast).toHaveBeenCalledWith('아바타를 저장하지 못했어요. 다시 시도해 주세요'),
  );
  expect(router.dismissTo).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('아바타 선택하기'));
  await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/profile'));
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ style: 'nice' }));
});
it('카메라 권한 거부와 사진 선택 취소는 이동하지 않는다', async () => {
  jest
    .mocked(ImagePicker.requestCameraPermissionsAsync)
    .mockResolvedValue({ granted: false } as never);
  jest
    .mocked(ImagePicker.launchImageLibraryAsync)
    .mockResolvedValue({ canceled: true, assets: null });
  await renderScreen(<PhotoScreen />, qc());
  await fireEvent.press(screen.getByText('카메라로 프로필 만들기'));
  await fireEvent.press(screen.getByText('첨부사진으로 프로필 만들기'));
  expect(router.push).not.toHaveBeenCalled();
});
it('선택한 사진은 Blob 업로드 뒤 생성 API에 URL만 전달한다', async () => {
  const generate = jest
    .spyOn(api.me, 'generateProfile')
    .mockResolvedValue({ _id: 'new-job' } as never);
  setParams({ uri: 'file:///photo.jpg' });
  await renderScreen(<PhotoStyleScreen />, qc());
  await fireEvent.press(screen.getByText('프로필 생성하기 →'));
  await waitFor(() =>
    expect(generate).toHaveBeenCalledWith({
      photoBlobUrl: 'https://blob/profile.jpg',
      prompt: '',
      style: null,
    }),
  );
  expect(uploadToBlob).toHaveBeenCalledWith(
    'image',
    expect.objectContaining({ uri: 'file:///photo.jpg' }),
  );
  await act(async () => {});
  expect(router.replace).toHaveBeenCalledWith({
    pathname: '/(tabs)/profile/photo-gen',
    params: { jobId: 'new-job' },
  });
});
