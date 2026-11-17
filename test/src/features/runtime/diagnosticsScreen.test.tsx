import {fireEvent, render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';

import {DiagnosticsScreen} from '~/features/release/screens';
import {theme} from '~/theme';
import {setActiveLocale} from '~/utils/i18n';
import {TestSafeAreaProvider} from '../../../testUtils';

// The row that re-reads the event list was labelled with the form-button
// "Update", which Korean renders as 수정 ("edit").
describe('diagnostics screen', () => {
  it('labels the list reload as Refresh', () => {
    setActiveLocale('en');
    const screen = render(
      <CpkProvider
        themeConfig={{customTheme: theme, initialThemeType: 'light'}}
      >
        <DiagnosticsScreen />
      </CpkProvider>,
      {wrapper: TestSafeAreaProvider},
    );
    fireEvent.press(screen.getByText('Refresh'));
    expect(screen.queryByText('Update')).toBeNull();
  });
});
