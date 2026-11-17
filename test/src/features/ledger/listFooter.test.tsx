import {render} from '@testing-library/react-native';

import {ListFooter} from '../../../../src/features/ledger/ui';

describe('ledger list footer', () => {
  it('does not label a populated exhausted list as empty', () => {
    const screen = render(<ListFooter exhausted loading={false} />);

    expect(screen.queryByText('There is yet added list.')).toBeNull();
    expect(screen.toJSON()).toBeTruthy();
  });
});
