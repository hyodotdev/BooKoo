import {Alert} from 'react-native';

import {showNotice} from '../../../src/utils/alert';
import {resetLocaleToDevice, setActiveLocale} from '../../../src/STRINGS';

describe('showNotice', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    resetLocaleToDevice();
  });

  it('labels the dismiss button in the app language, not the system one', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    setActiveLocale('en');
    showNotice('Saved', 'Body');
    setActiveLocale('ko');
    showNotice('저장됨');

    expect(alert).toHaveBeenNthCalledWith(1, 'Saved', 'Body', [{text: 'OK'}]);
    expect(alert).toHaveBeenNthCalledWith(2, '저장됨', undefined, [
      {text: '확인'},
    ]);
  });
});
