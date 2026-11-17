import type {ReactElement} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {Typography, useCPK} from 'cpk-ui';

import {ledgerAccentSurface} from '~/theme/ledgerAccent';
import {useLedgerAccent} from '~/theme/ledgerAccentProvider';

export interface BookooSegment<Value extends string | number = string> {
  readonly text: string;
  readonly value: Value;
}

/** Rounded BooKoo filter control with an independent selected capsule. */
export function BookooSegmentedControl<Value extends string | number = string>({
  onValueChange,
  selectedBackgroundColor,
  selectedTextColor,
  selectedValue,
  values,
}: {
  readonly onValueChange: (value: Value) => void;
  readonly selectedBackgroundColor?: string;
  readonly selectedTextColor?: string;
  readonly selectedValue: Value;
  readonly values: readonly BookooSegment<Value>[];
}): ReactElement {
  const {theme, themeType} = useCPK();
  const accent = useLedgerAccent();
  const surface = ledgerAccentSurface(
    accent,
    themeType === 'dark' ? 'dark' : 'light',
  );
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.track, {backgroundColor: theme.bg.skeleton}]}
      testID="bookoo-segmented-control"
    >
      {values.map((item) => {
        const selected = item.value === selectedValue;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{selected}}
            key={item.value}
            onPress={() => onValueChange(item.value)}
            style={({pressed}) => [styles.segment, pressed && {opacity: 0.78}]}
          >
            <View
              pointerEvents="none"
              style={[
                styles.segmentVisual,
                selected && {
                  backgroundColor:
                    selectedBackgroundColor ?? surface.background,
                },
              ]}
              testID={`bookoo-segment-${item.value}`}
            >
              {/* R74's 1.25 control cap: the 36/44pt capsule cut enlarged
                  labels in half ("All | Exp… | Inco…"). */}
              <Typography.Body3
                $fontWeight={selected ? 'bold' : 'normal'}
                maxFontSizeMultiplier={1.25}
                numberOfLines={1}
                style={[
                  styles.label,
                  {
                    color: selected
                      ? (selectedTextColor ?? surface.foreground)
                      : theme.text.label,
                  },
                ]}
              >
                {item.text}
              </Typography.Body3>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {textAlign: 'center'},
  segment: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 2,
  },
  segmentVisual: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderCurve: 'continuous',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  track: {
    alignItems: 'center',
    borderRadius: 22,
    flexDirection: 'row',
    gap: 2,
    height: 44,
    paddingHorizontal: 4,
  },
});
