import { render, screen } from '@testing-library/react-native';

import { PlaceholderScreen } from '../screens/PlaceholderScreen';

describe('PlaceholderScreen', () => {
  it('제목을 보여 준다', async () => {
    await render(<PlaceholderScreen title="퀴즈" />);
    expect(screen.getByText('퀴즈')).toBeTruthy();
  });
});
