import {act, renderHook} from '@testing-library/react-native';

import {useDebouncedValue} from '../../../src/hooks/useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps the previous value until the delay elapses', () => {
    const {result, rerender} = renderHook(
      ({value}: {value: string}) => useDebouncedValue(value, 500),
      {initialProps: {value: 'user7'}},
    );

    expect(result.current).toBe('user7');
    rerender({value: 'alice'});
    expect(result.current).toBe('user7');
    act(() => {
      jest.advanceTimersByTime(499);
    });
    expect(result.current).toBe('user7');
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe('alice');
  });
});
