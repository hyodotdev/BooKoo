import type {ReactElement} from 'react';
import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {
  CustomPressable,
  EditText,
  Icon,
  SelectionFeedback,
  Typography,
  useCPK,
} from 'cpk-ui';
import {
  ALL_CATEGORY_ICON_NAMES,
  CATEGORY_COLOR_TOKENS,
  CATEGORY_LABEL_MAX_LENGTH,
  categoryNameInput,
  type CategoryColorToken,
} from '@shared/categories';
import {CATEGORY_COLORS} from '~/theme/chartPalette';
import {t} from '~/utils/i18n';
import {ledgerIconSelectItems} from './ledgerIdentity';
import {safeIconName} from './ui';
import {iconCellWidth} from '~/components/uis/iconGrid';
import {wholeWordFit} from '~/utils/textFit';

export interface CategoryDraft {
  readonly label: string;
  readonly iconKey: string;
  readonly colorToken: CategoryColorToken;
}

/** Bounded, bundled category taxonomy. Only the selected identity is sent to Convex. */
const ICON_GAP = 8;

export function CategoryFormFields({
  disabled = false,
  nameTestID,
  onChange,
  placeholder = t('category.namePlaceholder'),
  value,
}: {
  readonly disabled?: boolean;
  readonly nameTestID: string;
  readonly onChange: (value: CategoryDraft) => void;
  readonly placeholder?: string;
  readonly value: CategoryDraft;
}): ReactElement {
  const {theme, themeType} = useCPK();
  const [query, setQuery] = useState('');
  const [gridWidth, setGridWidth] = useState<number | null>(null);
  // Fixed 60pt cells broke "Maintenance fee" inside the word.
  const cellWidth = iconCellWidth(gridWidth, ICON_GAP);
  const mode = themeType === 'dark' ? 'dark' : 'light';
  const color = CATEGORY_COLORS[value.colorToken][mode];
  // The name field lifts every keystroke to the parent. Without these memos the
  // 151-entry catalog is rebuilt and every icon cell re-renders on each key.
  // The group label doubles as the locale key: it changes whenever `t` does.
  const otherGroup = t('icon.groupOther');
  const choices = useMemo(() => {
    const known = new Map(
      ledgerIconSelectItems().map((item) => [item.value, item]),
    );
    return ALL_CATEGORY_ICON_NAMES.map(
      (icon) =>
        known.get(icon) ?? {
          group: otherGroup,
          label: icon.replace(/([a-z])([A-Z])/g, '$1 $2'),
          value: icon,
        },
    );
  }, [otherGroup]);
  const needle = query.trim().toLocaleLowerCase();
  const filtered = useMemo(
    () =>
      choices.filter((item) =>
        `${item.label} ${item.value}`.toLocaleLowerCase().includes(needle),
      ),
    [choices, needle],
  );
  const groups = [t('icon.expense'), t('icon.income'), otherGroup];
  // Selection callbacks stay identity-stable so the memoized cells survive a
  // name keystroke; the committed draft is read from a ref, never during render.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  const selectIcon = useCallback(
    (iconKey: string) => onChange({...valueRef.current, iconKey}),
    [onChange],
  );
  const selectColor = useCallback(
    (colorToken: CategoryColorToken) =>
      onChange({...valueRef.current, colorToken}),
    [onChange],
  );
  return (
    <View
      onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
      style={styles.fields}
      testID="category-form-fields"
    >
      <View style={styles.identity}>
        <SelectionFeedback
          selection={`${value.colorToken}:${value.iconKey}`}
          style={[styles.preview, {backgroundColor: theme.role.underlay}]}
          testID="category-identity-preview"
        >
          <Icon color={color} name={safeIconName(value.iconKey)} size={30} />
        </SelectionFeedback>
        <View style={styles.name}>
          <EditText
            decoration="boxed"
            editable={!disabled}
            hideCounter
            maxLength={CATEGORY_LABEL_MAX_LENGTH}
            onChangeText={(label) =>
              onChange({...value, label: categoryNameInput(label)})
            }
            placeholder={placeholder}
            testID={nameTestID}
            textInputProps={{
              autoCorrect: false,
              returnKeyType: 'done',
            }}
            value={value.label}
          />
        </View>
      </View>
      <View style={styles.section}>
        <Typography.Body2 $fontWeight="bold">
          {t('common.color')}
        </Typography.Body2>
        <View style={styles.colors}>
          {CATEGORY_COLOR_TOKENS.map((token) => (
            <CustomPressable
              accessibilityLabel={token.replace('category.', '')}
              accessibilityRole="radio"
              accessibilityState={{
                checked: value.colorToken === token,
                disabled,
              }}
              disabled={disabled}
              key={token}
              onPress={() => selectColor(token)}
              style={styles.colorTarget}
              testID={`category-color-${token}`}
            >
              <SelectionFeedback
                active={value.colorToken === token}
                selection={value.colorToken}
                style={[
                  styles.swatch,
                  {backgroundColor: CATEGORY_COLORS[token][mode]},
                ]}
              >
                {value.colorToken === token ? (
                  <Icon color={theme.bg.basic} name="Check" size={18} />
                ) : null}
              </SelectionFeedback>
            </CustomPressable>
          ))}
        </View>
      </View>
      <EditText
        decoration="boxed"
        hideCounter
        onChangeText={setQuery}
        placeholder={t('icon.searchPlaceholder')}
        startElement={
          <Icon
            color={theme.text.placeholder}
            name="MagnifyingGlass"
            size={20}
          />
        }
        testID="category-icon-search"
        value={query}
      />
      {filtered.length === 0 ? (
        <Typography.Body3>{t('icon.noResult')}</Typography.Body3>
      ) : null}
      {groups.map((group) => {
        const icons = filtered.filter((item) => item.group === group);
        if (icons.length === 0) return null;
        return (
          <View key={group} style={styles.section}>
            <View style={styles.sectionHeading}>
              <Typography.Body3 style={{color: theme.text.label}}>
                {group}
              </Typography.Body3>
              <View
                style={[styles.divider, {backgroundColor: theme.role.divider}]}
              />
            </View>
            <View style={styles.icons}>
              {icons.map((item) => (
                <CategoryIconCell
                  basicColor={theme.text.basic}
                  disabled={disabled}
                  iconKey={item.value}
                  key={item.value}
                  label={item.label}
                  labelColor={theme.text.label}
                  onSelect={selectIcon}
                  selected={item.value === value.iconKey}
                  selectedColor={color}
                  underlayColor={theme.role.underlay}
                  width={cellWidth}
                />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const CategoryIconCell = memo(function CategoryIconCell({
  basicColor,
  disabled,
  iconKey,
  label,
  labelColor,
  onSelect,
  selected,
  selectedColor,
  underlayColor,
  width,
}: {
  readonly basicColor: string;
  readonly disabled: boolean;
  readonly iconKey: string;
  readonly label: string;
  readonly labelColor: string;
  readonly onSelect: (iconKey: string) => void;
  readonly selected: boolean;
  readonly selectedColor: string;
  readonly underlayColor: string;
  readonly width: number;
}): ReactElement {
  return (
    <CustomPressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{checked: selected, disabled}}
      disabled={disabled}
      onPress={() => onSelect(iconKey)}
      style={[
        styles.iconCell,
        {
          backgroundColor: selected ? underlayColor : 'transparent',
          borderColor: selected ? selectedColor : 'transparent',
          width,
        },
      ]}
      testID={`category-icon-${iconKey}`}
    >
      <Icon
        color={selected ? selectedColor : basicColor}
        name={safeIconName(iconKey)}
        size={24}
      />
      <Typography.Body4
        {...wholeWordFit(label)}
        maxFontSizeMultiplier={1.25}
        ellipsizeMode="tail"
        style={[
          styles.iconLabel,
          {color: selected ? selectedColor : labelColor},
        ]}
      >
        {label}
      </Typography.Body4>
    </CustomPressable>
  );
});

const styles = StyleSheet.create({
  fields: {gap: 28},
  identity: {alignItems: 'center', flexDirection: 'row', gap: 16},
  name: {flex: 1, minWidth: 0},
  preview: {
    alignItems: 'center',
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  section: {gap: 16},
  sectionHeading: {alignItems: 'center', flexDirection: 'row', gap: 14},
  divider: {flex: 1, height: StyleSheet.hairlineWidth},
  colors: {flexDirection: 'row', flexWrap: 'wrap'},
  colorTarget: {
    alignItems: 'center',
    borderRadius: 22,
    justifyContent: 'center',
    height: 44,
    width: 44,
  },
  swatch: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
    width: 28,
    borderRadius: 14,
  },
  icons: {flexDirection: 'row', flexWrap: 'wrap', gap: ICON_GAP},
  iconCell: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 76,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  iconLabel: {textAlign: 'center', width: '100%'},
});
