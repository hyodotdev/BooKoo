import {Keyboard, TextInput} from 'react-native';
import {KeyboardController} from 'react-native-keyboard-controller';

const waitForNextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });

/**
 * Fabric on Android re-parents focused EditText children if a stack pop starts
 * while the field is focused or the keyboard-controller avoiding view is still
 * resizing. Blur first, then wait for keyboard-controller's own hide event —
 * `Keyboard.isVisible()` from React Native does not see that keyboard.
 */
export const dismissKeyboardForNavigation = async (): Promise<void> => {
  const focused = TextInput.State.currentlyFocusedInput();
  if (focused !== undefined && focused !== null) {
    TextInput.State.blurTextInput(focused);
  }
  Keyboard.dismiss();
  await KeyboardController.dismiss({animated: true, keepFocus: false});
  await waitForNextFrame();
};

type ExitDestination =
  '/(app)/(tabs)/(root)' | '/ledgers' | '/sign-in' | '/sign-in-email';

export async function leaveCurrentScreen(
  router: {
    readonly back: () => void;
    readonly canGoBack: () => boolean;
    readonly replace: (href: ExitDestination) => void;
  },
  fallback: ExitDestination = '/(app)/(tabs)/(root)',
): Promise<void> {
  await dismissKeyboardForNavigation();
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

/**
 * Run work after the current navigation transition has been scheduled.
 * InteractionManager can stall behind LogBox; a short timeout is enough for
 * the outgoing screen to detach before a tree-wide locale remount.
 */
export const afterNavigationSettles = (work: () => void): void => {
  setTimeout(work, 50);
};
