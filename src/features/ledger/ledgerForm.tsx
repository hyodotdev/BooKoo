import type {ReactElement} from 'react';
import {useMemo, useState} from 'react';
import {Modal, StyleSheet, View} from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardAvoidingView,
  useKeyboardState,
} from 'react-native-keyboard-controller';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  CustomPressable,
  EditText,
  Icon,
  SelectionFeedback,
  Typography,
  useCPK,
} from 'cpk-ui';

import {SUPPORTED_CURRENCIES, currencySymbolFallback} from '@shared/currency';
import {randomLedgerIcon} from '@shared/ledgerIcons';
import {BookooButton} from '~/components/uis/BookooButton';
import {BOOKOO_PALETTE} from '~/theme/bookooPalette';
import {ColorIconSelectScreen} from '~/components/uis/ColorIconSelect';
import {OptionSelectScreen} from '~/components/uis/OptionSelect';
import {useLocale} from '~/hooks/useLocale';
import {
  LEDGER_ACCENTS,
  LEDGER_COLOR_KEYS,
  ledgerAccentSurface,
  type LedgerColorKey,
} from '~/theme/ledgerAccent';
import {t} from '~/utils/i18n';
import {CIRCULAR_ICON_TARGET, circularIconRipple} from '~/theme/layout';
import {ledgerColorSelectItems, ledgerIconSelectItems} from './ledgerIdentity';
import {AppScreen, LedgerMark, statusBarStyleForTheme} from './ui';

export interface LedgerDraft {
  readonly title: string;
  readonly description: string;
  readonly colorKey: LedgerColorKey;
  readonly iconKey: string;
  readonly baseCurrency: string;
}

export function LedgerForm({
  onBack,
  onSubmit,
}: {
  onBack?: () => void;
  onSubmit: (draft: LedgerDraft) => Promise<void>;
}): ReactElement {
  const {theme, themeType} = useCPK();
  const {bottom, top} = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const mode = themeType === 'dark' ? 'dark' : 'light';
  const {defaultCurrency} = useLocale();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [baseCurrency, setBaseCurrency] = useState(defaultCurrency);
  const [colorKey, setColorKey] = useState<LedgerColorKey>('TEAL');
  const [iconKey, setIconKey] = useState(() => randomLedgerIcon());
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selecting, setSelecting] = useState<'currency' | 'icon' | null>(null);
  const accent = LEDGER_ACCENTS[colorKey][mode];
  const surface = ledgerAccentSurface(accent, mode);
  const foreground = surface.foreground;
  const placeholder = `${foreground}B3`;
  const currencyOptions = useMemo(
    () =>
      SUPPORTED_CURRENCIES.map((code) => ({
        label: `${code} | ${currencySymbolFallback(code)}`,
        value: code,
      })),
    [],
  );
  const missingRequired = title.trim().length === 0;
  const disabled = saving || missingRequired;

  const save = async (): Promise<void> => {
    if (disabled) return;
    setSaving(true);
    setFailed(false);
    try {
      await onSubmit({title, description, colorKey, iconKey, baseCurrency});
    } catch {
      setFailed(true);
      setSaving(false);
    }
  };

  return (
    <>
      <AppScreen
        backgroundColor={surface.background}
        bottomInsetColor={surface.background}
        statusBarStyle={statusBarStyleForTheme(themeType)}
      >
      <KeyboardAvoidingView
        behavior="height"
        keyboardVerticalOffset={top}
        style={styles.flex}
        testID="ledger-form"
      >
        <View style={styles.header}>
          {onBack === undefined ? (
            <View style={styles.headerButton} />
          ) : (
            <CustomPressable
              accessibilityLabel={t('a11y.back')}
              accessibilityRole="button"
              android_ripple={circularIconRipple(theme.role.underlay)}
              onPress={onBack}
              style={styles.headerButton}
            >
              <Icon color={foreground} name="CaretLeft" size={24} />
            </CustomPressable>
          )}
        </View>
        <KeyboardAwareScrollView
          style={styles.flex}
          bottomOffset={20}
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.form}>
            <EditText
              accessibilityLabel={t('ledger.titlePlaceholder')}
              autoCapitalize="sentences"
              colors={{
                basic: foreground,
                focused: foreground,
                placeholder,
              }}
              decoration="underline"
              hideCounter
              maxLength={80}
              onChangeText={setTitle}
              placeholder={t('ledger.titlePlaceholder')}
              placeholderColor={placeholder}
              styles={{
                container: styles.titleField,
                input: [styles.titleInput, {color: foreground}],
              }}
              value={title}
            />
            <EditText
              accessibilityLabel={t('ledger.descriptionPlaceholder')}
              autoCapitalize="sentences"
              colors={{
                basic: foreground,
                focused: foreground,
                placeholder,
              }}
              decoration="underline"
              hideCounter
              maxLength={300}
              multiline
              onChangeText={setDescription}
              placeholder={t('ledger.descriptionPlaceholder')}
              placeholderColor={placeholder}
              styles={{
                container: styles.descriptionField,
                input: [styles.descriptionInput, {color: foreground}],
              }}
              value={description}
            />
            <View style={styles.optionRow}>
              <Typography.Body2 $fontWeight="bold" style={{color: foreground}}>
                {t('common.color')}
              </Typography.Body2>
              <View style={styles.colorChoices}>
                {LEDGER_COLOR_KEYS.map((key) => (
                  <CustomPressable
                    accessibilityLabel={key}
                    accessibilityRole="radio"
                    accessibilityState={{checked: colorKey === key}}
                    key={key}
                    onPress={() => {
                      if (key === colorKey) return;
                      setColorKey(key);
                      setIconKey((current) => randomLedgerIcon(current));
                    }}
                    style={styles.colorButton}
                  >
                    <SelectionFeedback
                      active={colorKey === key}
                      selection={colorKey}
                      style={[
                        styles.colorSwatch,
                        {
                          backgroundColor: LEDGER_ACCENTS[key][mode].base,
                          borderColor: foreground,
                        },
                      ]}
                      testID={`ledger-form-color-${key}`}
                    >
                      {colorKey === key ? (
                        <Icon color={foreground} name="CheckBold" size={14} />
                      ) : null}
                    </SelectionFeedback>
                  </CustomPressable>
                ))}
              </View>
            </View>
            <View style={styles.optionRow}>
              <Typography.Body2 $fontWeight="bold" style={{color: foreground}}>
                {t('common.icon')}
              </Typography.Body2>
              <View style={styles.iconValue}>
                <CustomPressable
                  accessibilityLabel={t('a11y.shuffleIcon')}
                  accessibilityRole="button"
                  android_ripple={circularIconRipple(theme.role.underlay)}
                  onPress={() =>
                    setIconKey((current) => randomLedgerIcon(current))
                  }
                  style={styles.shuffleButton}
                  testID="ledger-form-shuffle"
                >
                  <Icon color={foreground} name="ArrowsClockwise" size={20} />
                </CustomPressable>
                <CustomPressable
                  accessibilityLabel={t('icon.selectTitle')}
                  accessibilityRole="button"
                  onPress={() => setSelecting('icon')}
                  style={styles.iconOpen}
                  testID="ledger-form-icon"
                >
                  <SelectionFeedback selection={`${colorKey}:${iconKey}`}>
                    <LedgerMark
                      colorKey={colorKey}
                      filled={false}
                      iconKey={iconKey}
                      size={36}
                    />
                  </SelectionFeedback>
                  <Icon color={foreground} name="CaretRight" size={18} />
                </CustomPressable>
              </View>
            </View>
            <CustomPressable
              accessibilityLabel={`${t('money.baseCurrency')}, ${baseCurrency}`}
              accessibilityRole="button"
              onPress={() => setSelecting('currency')}
              style={styles.currencyRow}
              testID="ledger-form-currency"
            >
              <Typography.Body2
                $fontWeight="bold"
                style={[styles.flexLabel, {color: foreground}]}
              >
                {t('money.baseCurrency')}
              </Typography.Body2>
              <View
                style={styles.currencyValue}
                testID="ledger-form-currency-value"
              >
                <Typography.Body2 style={{color: foreground}}>
                  {`${baseCurrency} | ${currencySymbolFallback(baseCurrency)}`}
                </Typography.Body2>
                <Icon color={foreground} name="CaretRight" size={18} />
              </View>
            </CustomPressable>
            {failed ? (
              <Typography.Body3
                accessibilityLiveRegion="polite"
                style={[styles.error, {color: foreground}]}
              >
                {t('error.generic')}
              </Typography.Body3>
            ) : null}
          </View>
        </KeyboardAwareScrollView>
        <View testID="ledger-form-completion">
          <View
            style={[
              styles.completion,
              {paddingBottom: keyboardVisible ? 12 : bottom + 20},
            ]}
          >
            <BookooButton
              accessibilityLabel={t('common.done')}
              color="light"
              borderRadius={28}
              disabled={disabled}
              loading={saving}
              onPress={() => void save()}
              testID="ledger-form-done"
              text={t('common.done')}
              style={styles.completionButton}
              styles={{
                container: styles.completionSurface,
                text: {color: accent.text},
                disabled: styles.completionDisabled,
              }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
      </AppScreen>
      <Modal
        animationType="slide"
        onRequestClose={() => setSelecting(null)}
        presentationStyle="pageSheet"
        visible={selecting === 'currency'}
      >
        <OptionSelectScreen
          applyLabel={t('common.apply')}
          onApply={(code) => {
            setBaseCurrency(code);
            setSelecting(null);
          }}
          onClose={() => setSelecting(null)}
          options={currencyOptions}
          searchPlaceholder={t('money.searchCurrency')}
          title={t('money.selectCurrency')}
          value={baseCurrency}
        />
      </Modal>
      <Modal
        animationType="slide"
        onRequestClose={() => setSelecting(null)}
        presentationStyle="pageSheet"
        visible={selecting === 'icon'}
      >
        <ColorIconSelectScreen
          applyLabel={t('common.apply')}
          colors={ledgerColorSelectItems(mode)}
          icons={ledgerIconSelectItems()}
          onApply={(next) => {
            setColorKey(next.color);
            setIconKey(next.icon);
            setSelecting(null);
          }}
          onClose={() => setSelecting(null)}
          searchPlaceholder={t('icon.searchPlaceholder')}
          title={t('icon.selectTitle')}
          value={{color: colorKey, icon: iconKey}}
        />
      </Modal>
    </>
  );

}

const styles = StyleSheet.create({
  completion: {alignItems: 'flex-end', paddingHorizontal: 24, paddingTop: 12},
  completionButton: {alignSelf: 'flex-end', minWidth: 104},
  completionSurface: {
    backgroundColor: BOOKOO_PALETTE.white,
    minHeight: 48,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  completionDisabled: {backgroundColor: BOOKOO_PALETTE.white, opacity: 0.55},
  colorButton: {
    alignItems: 'center',
    borderRadius: 16,
    height: 44,
    justifyContent: 'center',
    width: 32,
  },
  colorChoices: {
    flexDirection: 'row',
    flexShrink: 1,
    gap: 4,
    justifyContent: 'flex-end',
  },
  colorSwatch: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  currencyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'space-between',
    minHeight: 48,
  },
  currencyValue: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 4,
    marginLeft: 'auto',
  },
  descriptionField: {borderBottomWidth: 0, minHeight: 112},
  descriptionInput: {
    fontSize: 17,
    minHeight: 88,
    paddingTop: 8,
    textAlignVertical: 'top',
  },
  error: {textAlign: 'center'},
  flex: {flex: 1},
  flexLabel: {flexShrink: 1},
  form: {gap: 24, paddingHorizontal: 40, paddingTop: 24},
  shuffleButton: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 44,
  },
  header: {height: 56, justifyContent: 'center'},
  headerButton: {
    ...CIRCULAR_ICON_TARGET,
  },
  iconOpen: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
  },
  iconValue: {alignItems: 'center', flexDirection: 'row', gap: 4},
  optionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    minHeight: 64,
  },
  scrollContent: {flexGrow: 1, paddingBottom: 12},
  titleField: {borderBottomWidth: 0, minHeight: 52},
  // cpk-ui derives lineHeight from its own size (16 -> 20); a 24pt override
  // needs its own line box or iOS clips the ascenders.
  titleInput: {
    fontSize: 24,
    lineHeight: 30,
    minHeight: 48,
  },
});
