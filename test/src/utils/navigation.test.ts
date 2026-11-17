import {Keyboard, TextInput} from 'react-native';
import {KeyboardController} from 'react-native-keyboard-controller';

import {
  afterNavigationSettles,
  dismissKeyboardForNavigation,
  leaveCurrentScreen,
} from '../../../src/utils/navigation';

describe('leaveCurrentScreen', () => {
  beforeEach(() => {
    jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    jest.spyOn(KeyboardController, 'dismiss').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('blurs the focused field and waits for keyboard-controller before popping', async () => {
    const field = {} as never;
    const blur = jest.spyOn(TextInput.State, 'blurTextInput');
    jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue(field);
    const router = {
      back: jest.fn(),
      canGoBack: () => true,
      replace: jest.fn(),
    };

    await leaveCurrentScreen(router);

    expect(blur).toHaveBeenCalledWith(field);
    expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
    expect(KeyboardController.dismiss).toHaveBeenCalledWith({
      animated: true,
      keepFocus: false,
    });
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('replaces home when there is no back stack', async () => {
    const router = {
      back: jest.fn(),
      canGoBack: () => false,
      replace: jest.fn(),
    };

    await leaveCurrentScreen(router);

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/(app)/(tabs)/(root)');
  });

  it.each(['/ledgers', '/sign-in', '/sign-in-email'] as const)(
    'uses the owning %s surface for a direct entry without history',
    async (fallback) => {
      const router = {
        back: jest.fn(),
        canGoBack: () => false,
        replace: jest.fn(),
      };
      await leaveCurrentScreen(router, fallback);
      expect(router.back).not.toHaveBeenCalled();
      expect(router.replace).toHaveBeenCalledWith(fallback);
    },
  );
});

describe('dismissKeyboardForNavigation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('blurs and waits for keyboard-controller even when RN Keyboard is hidden', async () => {
    jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    jest.spyOn(KeyboardController, 'dismiss').mockResolvedValue(undefined);

    await expect(dismissKeyboardForNavigation()).resolves.toBeUndefined();
    expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
    expect(KeyboardController.dismiss).toHaveBeenCalledWith({
      animated: true,
      keepFocus: false,
    });
  });
});

describe('afterNavigationSettles', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('defers work until after the current turn', () => {
    const work = jest.fn();

    afterNavigationSettles(work);
    expect(work).not.toHaveBeenCalled();

    jest.advanceTimersByTime(50);
    expect(work).toHaveBeenCalledTimes(1);
  });
});
