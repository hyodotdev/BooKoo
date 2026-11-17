import type {ReactElement} from 'react';
import {useCallback, useMemo, useState} from 'react';
import {StatusBar, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {FlashList} from '@shopify/flash-list';
import {CustomPressable, EditText, Icon, Typography, useCPK} from 'cpk-ui';
import {SelectionRadio} from './SelectionRadio';

import {BookooBottomAction} from './BookooBottomAction';
import {CIRCULAR_ICON_TARGET, circularIconRipple} from '~/theme/layout';
import {statusBarStyleForTheme} from '~/theme/statusBar';
import {t} from '~/utils/i18n';

export interface OptionSelectItem<Value extends string = string> {
  readonly value: Value;
  readonly label: string;
}

export function OptionSelectList<Value extends string>({
  onSelect,
  options,
  selected,
  testID,
}: {
  readonly onSelect: (value: Value) => void;
  readonly options: readonly OptionSelectItem<Value>[];
  readonly selected: Value;
  readonly testID?: string;
}): ReactElement {
  const {theme} = useCPK();
  const renderItem = useCallback(
    ({item}: {item: OptionSelectItem<Value>}) => {
      const checked = item.value === selected;
      return (
        <CustomPressable
          accessibilityLabel={item.label}
          accessibilityRole="radio"
          accessibilityState={{checked}}
          onPress={() => onSelect(item.value)}
          style={[
            styles.row,
            {borderBottomColor: theme.role.divider},
          ]}
          testID={`option-select-${item.value}`}
        >
          <Typography.Body1
            $fontWeight={checked ? 'bold' : 'normal'}
            style={{color: theme.text.basic}}
          >
            {item.label}
          </Typography.Body1>
          <SelectionRadio selected={checked} />
        </CustomPressable>
      );
    },
    [onSelect, selected, theme.role.divider, theme.text.basic],
  );

  return (
    <FlashList
      data={options}
      extraData={selected}
      keyExtractor={(item) => item.value}
      renderItem={renderItem}
      testID={testID}
    />
  );
}

export function OptionSelectScreen<Value extends string>({
  applyLabel,
  onApply,
  onClose,
  options,
  searchPlaceholder,
  title,
  value,
}: {
  readonly applyLabel: string;
  readonly onApply: (value: Value) => void;
  readonly onClose: () => void;
  readonly options: readonly OptionSelectItem<Value>[];
  readonly searchPlaceholder?: string;
  readonly title: string;
  readonly value: Value;
}): ReactElement {
  const {theme, themeType} = useCPK();
  const [draft, setDraft] = useState(value);
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return options;
    return options.filter(
      (item) =>
        item.label.toLowerCase().includes(needle) ||
        item.value.toLowerCase().includes(needle),
    );
  }, [options, query]);

  return (
    <SafeAreaView
      // BookooBottomAction owns the bottom inset; including it here doubles the pad.
      edges={['top', 'left', 'right']}
      style={[styles.screen, {backgroundColor: theme.bg.paper}]}
      testID="option-select-screen"
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
          testID="option-select-close"
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
      {searchPlaceholder === undefined ? null : (
        <EditText
          decoration="underline"
          hideCounter
          onChangeText={setQuery}
          placeholder={searchPlaceholder}
          placeholderColor={theme.text.placeholder}
          styles={{
            container: styles.search,
            input: [styles.searchInput, {color: theme.text.basic}],
          }}
          testID="option-select-search"
          value={query}
        />
      )}
      <View style={styles.list}>
        <OptionSelectList
          onSelect={setDraft}
          options={visible}
          selected={draft}
          testID="option-select-list"
        />
      </View>
      <BookooBottomAction
        accessibilityLabel={applyLabel}
        onPress={() => onApply(draft)}
        testID="option-select-apply"
        text={applyLabel}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  list: {flex: 1},
  row: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 24,
  },
  screen: {flex: 1},
  search: {marginHorizontal: 24, marginTop: 4},
  searchInput: {fontSize: 17, minHeight: 44},
  title: {paddingBottom: 12, paddingHorizontal: 24},
});
