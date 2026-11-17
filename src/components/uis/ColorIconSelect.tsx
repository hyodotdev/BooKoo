import type {ReactElement} from 'react';
import {useMemo, useState} from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  CustomPressable,
  EditText,
  Icon,
  SelectionFeedback,
  Typography,
  iconList,
  useCPK,
  type IconName,
} from 'cpk-ui';

import {BookooBottomAction} from './BookooBottomAction';
import {CIRCULAR_ICON_TARGET, circularIconRipple} from '~/theme/layout';
import {statusBarStyleForTheme} from '~/theme/statusBar';
import {t} from '~/utils/i18n';
import {wholeWordFit} from '~/utils/textFit';
import {iconCellWidth} from './iconGrid';

const iconNames: ReadonlySet<string> = new Set(iconList);

const safeIconName = (
  value: string,
  fallback: IconName = 'Question',
): IconName => (iconNames.has(value) ? (value as IconName) : fallback);

export interface ColorIconSelectColor<Value extends string = string> {
  readonly accessibilityLabel: string;
  readonly color: string;
  readonly value: Value;
}

export interface ColorIconSelectIcon<Value extends string = string> {
  readonly group: string;
  readonly label: string;
  readonly value: Value;
}

export interface ColorIconSelectValue<
  Color extends string = string,
  IconName extends string = string,
> {
  readonly color: Color;
  readonly icon: IconName;
}

export function ColorIconSelectScreen<
  Color extends string,
  IconName extends string,
>({
  applyLabel,
  colors,
  icons,
  onApply,
  onClose,
  searchPlaceholder,
  title,
  value,
}: {
  readonly applyLabel: string;
  readonly colors: readonly ColorIconSelectColor<Color>[];
  readonly icons: readonly ColorIconSelectIcon<IconName>[];
  readonly onApply: (value: ColorIconSelectValue<Color, IconName>) => void;
  readonly onClose: () => void;
  readonly searchPlaceholder: string;
  readonly title: string;
  readonly value: ColorIconSelectValue<Color, IconName>;
}): ReactElement {
  const {theme, themeType} = useCPK();
  const {width: windowWidth} = useWindowDimensions();
  // An iPad page sheet is narrower than the window; sizing cells from the
  // window left a gap column and an off-centre grid.
  const [frameWidth, setFrameWidth] = useState<number | null>(null);
  const width = frameWidth ?? windowWidth;
  const [draft, setDraft] = useState(value);
  const [query, setQuery] = useState('');
  const selectedColor =
    colors.find((item) => item.value === draft.color)?.color ??
    theme.role.primary;
  const horizontalPad = 24;
  const gap = 8;
  const cellWidth = iconCellWidth(width - horizontalPad * 2, gap);
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered =
      needle.length === 0
        ? icons
        : icons.filter(
            (item) =>
              item.label.toLowerCase().includes(needle) ||
              item.value.toLowerCase().includes(needle),
          );
    const order: string[] = [];
    const byGroup = new Map<string, ColorIconSelectIcon<IconName>[]>();
    for (const item of filtered) {
      const existing = byGroup.get(item.group);
      if (existing === undefined) {
        byGroup.set(item.group, [item]);
        order.push(item.group);
      } else {
        existing.push(item);
      }
    }
    return order.map((group) => ({
      group,
      icons: byGroup.get(group) ?? [],
    }));
  }, [icons, query]);

  return (
    <SafeAreaView
      // BookooBottomAction owns the bottom inset; including it here doubles the pad.
      edges={['top', 'left', 'right']}
      onLayout={(event) =>
        setFrameWidth(Math.round(event.nativeEvent.layout.width))
      }
      style={[styles.screen, {backgroundColor: theme.bg.paper}]}
      testID="color-icon-select-screen"
    >
      <StatusBar
        backgroundColor={theme.bg.paper}
        barStyle={statusBarStyleForTheme(themeType)}
        hidden={false}
      />
      <View style={styles.header}>
        <CustomPressable
          accessibilityLabel={t('a11y.close')}
          accessibilityRole="button"
          android_ripple={circularIconRipple(theme.role.underlay)}
          onPress={onClose}
          style={styles.headerButton}
          testID="color-icon-select-close"
        >
          <Icon color={theme.text.basic} name="X" size={24} />
        </CustomPressable>
      </View>
      <Typography.Heading3
        $fontWeight="bold"
        style={[styles.title, {color: theme.text.basic}]}
      >
        {title}
      </Typography.Heading3>
      <View style={styles.colors}>
        {colors.map((item) => {
          const checked = item.value === draft.color;
          return (
            <CustomPressable
              accessibilityLabel={item.accessibilityLabel}
              accessibilityRole="radio"
              accessibilityState={{checked}}
              key={item.value}
              onPress={() =>
                setDraft((current) => ({...current, color: item.value}))
              }
              style={styles.colorButton}
              testID={`color-icon-select-color-${item.value}`}
            >
              <SelectionFeedback
                active={checked}
                selection={draft.color}
                style={[
                  styles.colorSwatch,
                  {
                    backgroundColor: item.color,
                    borderColor: theme.bg.paper,
                  },
                ]}
              >
                {checked ? (
                  <Icon color={theme.text.contrast} name="Check" size={14} />
                ) : null}
              </SelectionFeedback>
            </CustomPressable>
          );
        })}
      </View>
      <View style={styles.search} testID="color-icon-select-search-frame">
        <EditText
          decoration="boxed"
          hideCounter
          onChangeText={setQuery}
          placeholder={searchPlaceholder}
          placeholderColor={theme.text.placeholder}
          startElement={
            <Icon
              color={theme.text.placeholder}
              name="MagnifyingGlass"
              size={20}
            />
          }
          styles={{
            container: styles.searchContainer,
            input: [styles.searchInput, {color: theme.text.basic}],
          }}
          testID="color-icon-select-search"
          value={query}
        />
      </View>
      <ScrollView
        contentContainerStyle={styles.gridContent}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        style={styles.flex}
        testID="color-icon-select-list"
      >
        {groups.length === 0 ? (
          <Typography.Body3
            style={[styles.empty, {color: theme.text.placeholder}]}
          >
            {t('icon.noResult')}
          </Typography.Body3>
        ) : (
          groups.map((section) => (
            <View key={section.group} style={styles.section}>
              <Typography.Body2
                $fontWeight="bold"
                style={{color: theme.text.placeholder}}
              >
                {section.group}
              </Typography.Body2>
              <View style={styles.grid}>
                {section.icons.map((item) => {
                  const checked = item.value === draft.icon;
                  return (
                    <CustomPressable
                      accessibilityLabel={item.label}
                      accessibilityRole="radio"
                      accessibilityState={{checked}}
                      key={item.value}
                      onPress={() =>
                        setDraft((current) => ({
                          ...current,
                          icon: item.value,
                        }))
                      }
                      style={[styles.iconCell, {width: cellWidth}]}
                      testID={`color-icon-select-icon-${item.value}`}
                    >
                      <SelectionFeedback
                        active={checked}
                        selection={`${draft.color}:${draft.icon}`}
                        style={[
                          styles.iconGlyph,
                          {
                            backgroundColor: checked
                              ? selectedColor
                              : theme.bg.paper,
                          },
                        ]}
                      >
                        <Icon
                          color={
                            checked ? theme.text.contrast : theme.text.basic
                          }
                          name={safeIconName(item.value)}
                          size={22}
                        />
                      </SelectionFeedback>
                      <Typography.Body4
                        {...wholeWordFit(item.label)}
                        maxFontSizeMultiplier={1.25}
                        style={{
                          color: checked
                            ? selectedColor
                            : theme.text.placeholder,
                          textAlign: 'center',
                        }}
                      >
                        {item.label}
                      </Typography.Body4>
                    </CustomPressable>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </ScrollView>
      <BookooBottomAction
        accessibilityLabel={applyLabel}
        onPress={() => onApply(draft)}
        testID="color-icon-select-apply"
        text={applyLabel}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  colorButton: {
    alignItems: 'center',
    borderRadius: 18,
    height: 44,
    justifyContent: 'center',
    width: 36,
  },
  colors: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    paddingHorizontal: 24,
  },
  colorSwatch: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  empty: {paddingHorizontal: 24, paddingTop: 24, textAlign: 'center'},
  flex: {flex: 1},
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridContent: {
    gap: 28,
    paddingBottom: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 64,
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  headerButton: {
    ...CIRCULAR_ICON_TARGET,
  },
  iconCell: {
    alignItems: 'center',
    borderRadius: 12,
    gap: 6,
    justifyContent: 'center',
    minHeight: 72,
    paddingVertical: 8,
  },
  iconGlyph: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  screen: {flex: 1},
  search: {marginHorizontal: 24, marginTop: 12},
  searchInput: {fontSize: 17, minHeight: 48},
  searchContainer: {borderRadius: 16},
  section: {gap: 14},
  title: {paddingBottom: 12, paddingHorizontal: 24},
});
