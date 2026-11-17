import 'react-native';

import {waitFor} from '@testing-library/react-native';

import ListEmptyItem from '../../../../src/components/uis/ListEmptyItem';
import {renderWithProviders} from '../../../testUtils';

describe('ListEmptyItem', () => {
  it('renders without crashing', async () => {
    const testingLib = renderWithProviders(<ListEmptyItem />);

    const baseElement = await waitFor(() => testingLib.toJSON());

    expect(baseElement).toBeTruthy();
  });

  it('renders in the dark theme too', async () => {
    const testingLib = renderWithProviders(<ListEmptyItem />, {
      themeType: 'dark',
    });

    const baseElement = await waitFor(() => testingLib.toJSON());

    expect(baseElement).toBeTruthy();
  });
});
