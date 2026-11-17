import {render} from '@testing-library/react-native';
import {useQuery} from 'convex/react';
import {CpkProvider} from 'cpk-ui';

import EntryCategoryRoute from '../../app/(app)/entry/category/index';
import EntryCategoryNewRoute from '../../app/(app)/entry/category/new';
import {theme} from '../../src/theme';
import {setActiveLocale, t} from '../../src/utils/i18n';
import {TestSafeAreaProvider} from '../testUtils';

// The global expo-router mock returns no search params, like a bare
// `bookoo://entry/category/new` link. Convex rejected `{ledgerId: undefined}`
// as a missing argument and the screen fell into the render-error boundary.
describe.each([
  ['picker', EntryCategoryRoute],
  ['creator', EntryCategoryNewRoute],
] as const)('entry category %s route without a ledger', (_name, Route) => {
  beforeEach(() => {
    setActiveLocale('en');
    jest.mocked(useQuery).mockReset().mockReturnValue(null);
  });

  it('asks for the empty id and shows the missing ledger', () => {
    const screen = render(
      <CpkProvider themeConfig={{customTheme: theme, initialThemeType: 'light'}}>
        <Route />
      </CpkProvider>,
      {wrapper: TestSafeAreaProvider},
    );

    expect(jest.mocked(useQuery).mock.calls[0]?.[1]).toEqual({ledgerId: ''});
    expect(screen.getByText(t('error.ledger.notFound'))).toBeTruthy();
  });
});
