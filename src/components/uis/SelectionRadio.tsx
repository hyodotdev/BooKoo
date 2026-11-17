import type {ReactElement} from 'react';
import {StyleSheet, View} from 'react-native';
import {RadioButton} from 'cpk-ui';

/** Visual radio for a single-choice row. The row owns the press and a11y. */
export function SelectionRadio({
  selected,
}: {
  readonly selected: boolean;
}): ReactElement {
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <RadioButton
        selected={selected}
        size="small"
        styles={{container: styles.mark}}
        type="primary"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    flex: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
  },
});
