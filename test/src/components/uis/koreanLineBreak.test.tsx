import {render} from '@testing-library/react-native';
import {CpkProvider, Typography} from 'cpk-ui';

import {theme} from '~/theme';
import {TestSafeAreaProvider} from '../../../testUtils';

// Wrapped Korean split inside words on iOS ("있어 / 요", "없 / 습니다").
describe('Korean line breaking', () => {
  it('keeps Korean words whole in app text', () => {
    const screen = render(
      <CpkProvider
        themeConfig={{customTheme: theme, initialThemeType: 'light'}}
      >
        <Typography.Body3>
          복구 기간 동안 다시 복원할 수 있어요.
        </Typography.Body3>
      </CpkProvider>,
      {wrapper: TestSafeAreaProvider},
    );
    expect(
      screen.getByText('복구 기간 동안 다시 복원할 수 있어요.'),
    ).toHaveProp('lineBreakStrategyIOS', 'hangul-word');
  });
});
