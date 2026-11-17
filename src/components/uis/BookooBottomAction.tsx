import type {ReactElement} from 'react';
import {StyleSheet, View} from 'react-native';
import {Typography, useCPK} from 'cpk-ui';
import {useKeyboardState} from 'react-native-keyboard-controller';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {BookooButton, type BookooButtonProps} from './BookooButton';

/** Full-width primary action that owns and paints the bottom safe area. */
export function BookooBottomAction({
  helperText,
  helperTone = 'neutral',
  ...buttonProps
}: Omit<
  BookooButtonProps,
  'borderRadius' | 'size' | 'style' | 'styles' | 'type'
> & {
  readonly helperText?: string;
  readonly helperTone?: 'error' | 'neutral';
}): ReactElement {
  const {theme} = useCPK();
  const {bottom} = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const bottomPadding = keyboardVisible ? 16 : Math.max(16, bottom + 11);

  return (
    <View style={styles.frame}>
      {helperText === undefined ? null : (
        <View
          style={[
            styles.helper,
            {
              backgroundColor: theme.bg.paper,
              borderTopColor: theme.role.divider,
            },
          ]}
        >
          <Typography.Body4
            accessibilityLiveRegion={helperTone === 'error' ? 'polite' : 'none'}
            style={{
              color:
                helperTone === 'error'
                  ? theme.text.validation
                  : theme.text.label,
            }}
          >
            {helperText}
          </Typography.Body4>
        </View>
      )}
      <BookooButton
        {...buttonProps}
        borderRadius={0}
        size="large"
        style={styles.button}
        styles={{
          container: [styles.container, {paddingBottom: bottomPadding}],
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {alignSelf: 'stretch'},
  container: {minHeight: 52, paddingHorizontal: 20, paddingTop: 16},
  frame: {alignSelf: 'stretch'},
  helper: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
});
