import type {
  ComponentProps,
  PropsWithChildren,
  ReactElement,
  ReactNode,
} from 'react';
import {useMemo} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {KeyboardStickyView} from 'react-native-keyboard-controller';
import {FlashList} from '@shopify/flash-list';
import {
  CustomPressable,
  Icon,
  LoadingIndicator,
  SwitchToggle,
  Typography,
  useCPK,
  type IconName,
} from 'cpk-ui';

import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {BookooBottomAction} from '~/components/uis/BookooBottomAction';
import {SelectionRadio} from '~/components/uis/SelectionRadio';
import {LEDGER_ACCENTS} from '~/theme/ledgerAccent';
import {DETAIL_CONTENT_TOP} from '~/theme/layout';
import {wholeWordFit} from '~/utils/textFit';

export function SettingsBottomAction(
  props: ComponentProps<typeof BookooBottomAction>,
): ReactElement {
  const {themeType} = useCPK();
  const brandAccent =
    LEDGER_ACCENTS.TEAL[themeType === 'dark' ? 'dark' : 'light'];

  return <BookooBottomAction {...props} accent={brandAccent} />;
}

export function SettingsPage({
  children,
  footer,
  testID,
}: PropsWithChildren<{
  readonly footer?: ReactNode;
  readonly testID?: string;
}>): ReactElement {
  const {theme} = useCPK();
  const {bottom} = useSafeAreaInsets();

  return (
    <View style={[styles.page, {backgroundColor: theme.bg.paper}]}>
      <ScrollView
        contentContainerStyle={[
          styles.pageContent,
          {
            paddingBottom:
              footer === undefined ? Math.max(28, bottom + 16) : 20,
          },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        testID={testID}
      >
        <View style={styles.column}>{children}</View>
      </ScrollView>
      {footer === undefined ? null : (
        <KeyboardStickyView testID="settings-keyboard-sticky">
          <View style={[styles.footer, {backgroundColor: theme.bg.paper}]}>
            {footer}
          </View>
        </KeyboardStickyView>
      )}
    </View>
  );
}

export function SettingsListFrame({
  children,
  footer,
}: PropsWithChildren<{readonly footer?: ReactNode}>): ReactElement {
  const {theme} = useCPK();

  return (
    <View style={[styles.page, {backgroundColor: theme.bg.paper}]}>
      <View style={styles.page}>{children}</View>
      {footer === undefined ? null : (
        <KeyboardStickyView testID="settings-list-keyboard-sticky">
          <View style={[styles.footer, {backgroundColor: theme.bg.paper}]}>
            {footer}
          </View>
        </KeyboardStickyView>
      )}
    </View>
  );
}

export interface SettingsListSection<Row> {
  readonly key: string;
  readonly title?: string;
  readonly data: readonly Row[];
  /** Dividers start under the row text: 14pt without icons, 58pt with. */
  readonly rowsWithoutIcons?: boolean;
}

type SettingsSectionListItem<Row> =
  | {
      readonly kind: 'header';
      readonly key: string;
      readonly title: string;
    }
  | {
      readonly kind: 'row';
      readonly key: string;
      readonly row: Row;
      readonly rowIndex: number;
      readonly rowCount: number;
      readonly rowsWithoutIcons: boolean;
      readonly sectionKey: string;
      readonly separated: boolean;
    };

/** FlashList-backed SectionList with sticky section headers. */
export function SettingsSectionList<Row>({
  empty,
  footer,
  fullWidth = false,
  header,
  keyExtractor,
  listFooter,
  onEndReached,
  renderItem,
  sections,
  testID,
}: {
  readonly empty?: ReactNode;
  readonly footer?: ReactNode;
  readonly fullWidth?: boolean;
  readonly header?: ReactNode;
  readonly keyExtractor: (row: Row) => string;
  readonly listFooter?: ReactNode;
  readonly onEndReached?: () => void;
  readonly renderItem: (
    row: Row,
    rowIndex: number,
    sectionKey: string,
  ) => ReactElement;
  readonly sections: readonly SettingsListSection<Row>[];
  readonly testID?: string;
}): ReactElement {
  const {theme} = useCPK();
  const {bottom} = useSafeAreaInsets();
  const data = useMemo<readonly SettingsSectionListItem<Row>[]>(
    () =>
      sections.flatMap((section, sectionIndex) =>
        section.data.length === 0
          ? []
          : [
              ...(section.title === undefined
                ? []
                : [
                    {
                      kind: 'header' as const,
                      key: `header:${section.key}`,
                      title: section.title,
                    },
                  ]),
              ...section.data.map((row, rowIndex) => ({
                kind: 'row' as const,
                key: `${section.key}:${keyExtractor(row)}`,
                row,
                rowCount: section.data.length,
                rowIndex,
                rowsWithoutIcons: section.rowsWithoutIcons ?? false,
                sectionKey: section.key,
                separated:
                  rowIndex === 0 &&
                  sectionIndex > 0 &&
                  section.title === undefined,
              })),
            ],
      ),
    [keyExtractor, sections],
  );
  const stickyHeaderIndices = useMemo(
    () =>
      data.flatMap((item, index) => (item.kind === 'header' ? [index] : [])),
    [data],
  );

  return (
    <SettingsListFrame footer={footer}>
      <FlashList
        contentContainerStyle={{
          paddingBottom: footer === undefined ? Math.max(28, bottom + 16) : 20,
          paddingHorizontal: 16,
          // First section headings already contribute 16pt. Unlabelled cards
          // need the same 20pt breathing room below their native/custom header.
          paddingTop:
            header !== undefined || sections[0]?.title !== undefined
              ? 4
              : DETAIL_CONTENT_TOP,
        }}
        contentInsetAdjustmentBehavior="automatic"
        data={data}
        getItemType={(item) => item.kind}
        keyExtractor={(item) => item.key}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={empty === undefined ? null : <View>{empty}</View>}
        ListFooterComponent={
          listFooter === undefined ? null : (
            <View
              style={[styles.listFooter, fullWidth && styles.fullWidthColumn]}
            >
              {listFooter}
            </View>
          )
        }
        ListHeaderComponent={
          header === undefined ? null : <View>{header}</View>
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        renderItem={({item}) => {
          if (item.kind === 'header')
            return (
              <View
                style={[
                  styles.sectionListHeader,
                  fullWidth && styles.fullWidthColumn,
                  {backgroundColor: theme.bg.paper},
                ]}
              >
                <Typography.Body4
                  $fontWeight="bold"
                  style={{color: theme.text.label}}
                >
                  {item.title}
                </Typography.Body4>
              </View>
            );

          const first = item.rowIndex === 0;
          const last = item.rowIndex === item.rowCount - 1;
          return (
            <View
              testID={first ? `settings-section-${item.sectionKey}` : undefined}
              style={[
                styles.sectionListRow,
                item.separated && styles.sectionListSeparated,
                fullWidth && styles.fullWidthColumn,
                first && styles.sectionListRowFirst,
                last && styles.sectionListRowLast,
                {
                  backgroundColor: theme.bg.basic,
                  borderColor: theme.role.border,
                },
              ]}
            >
              {renderItem(item.row, item.rowIndex, item.sectionKey)}
              {last ? null : (
                <SettingsDivider inset={item.rowsWithoutIcons ? 14 : 58} />
              )}
            </View>
          );
        }}
        stickyHeaderIndices={stickyHeaderIndices}
        testID={testID}
      />
    </SettingsListFrame>
  );
}

export function SettingsHero({
  body,
  icon,
  showTitle = false,
  title,
}: {
  readonly body: string;
  readonly icon: IconName;
  readonly showTitle?: boolean;
  readonly title: string;
}): ReactElement {
  const {theme} = useCPK();

  return (
    <View accessibilityLabel={`${title}. ${body}`} style={styles.hero}>
      <View style={[styles.heroIcon, {backgroundColor: theme.role.underlay}]}>
        <Icon color={theme.role.primary} name={icon} size={20} />
      </View>
      <View style={styles.heroCopy}>
        {showTitle ? (
          <Typography.Heading3 $fontWeight="bold">{title}</Typography.Heading3>
        ) : null}
        <Typography.Body3 style={{color: theme.text.label}}>
          {body}
        </Typography.Body3>
      </View>
    </View>
  );
}

export function SettingsSection({
  children,
  footer,
  title,
}: PropsWithChildren<{
  readonly footer?: string;
  readonly title?: string;
}>): ReactElement {
  const {theme} = useCPK();

  return (
    <View style={styles.section}>
      {title === undefined ? null : (
        <Typography.Body4
          $fontWeight="bold"
          style={[styles.sectionTitle, {color: theme.text.label}]}
        >
          {title}
        </Typography.Body4>
      )}
      <View
        style={[
          styles.sectionCard,
          {backgroundColor: theme.bg.basic, borderColor: theme.role.border},
        ]}
      >
        {children}
      </View>
      {footer === undefined ? null : (
        <Typography.Body4
          style={[styles.sectionFooter, {color: theme.text.placeholder}]}
        >
          {footer}
        </Typography.Body4>
      )}
    </View>
  );
}

export function SettingsDivider({
  inset = 58,
}: {
  readonly inset?: number;
} = {}): ReactElement {
  const {theme} = useCPK();

  return (
    <View
      style={[
        styles.divider,
        {backgroundColor: theme.role.divider, marginLeft: inset},
      ]}
      testID="settings-divider"
    />
  );
}

export function SettingsRow({
  accessibilityLabel,
  accessibilityRole,
  danger = false,
  detail,
  disabled = false,
  icon,
  iconColor,
  iconSurface,
  loading = false,
  onPress,
  selected = false,
  testID,
  title,
  trailing,
}: {
  readonly accessibilityLabel?: string;
  readonly accessibilityRole?: 'radio' | 'button';
  readonly danger?: boolean;
  readonly detail?: string;
  readonly disabled?: boolean;
  readonly icon?: IconName;
  readonly iconColor?: string;
  readonly iconSurface?: string;
  readonly loading?: boolean;
  readonly onPress?: () => void;
  readonly selected?: boolean;
  readonly testID?: string;
  readonly title: string;
  readonly trailing?: ReactNode;
}): ReactElement {
  const {theme} = useCPK();
  const choice = accessibilityRole === 'radio';
  const content = (
    <>
      {icon === undefined ? null : (
        <View
          style={[
            styles.rowIcon,
            {
              backgroundColor: danger
                ? theme.bg.highlight
                : (iconSurface ?? theme.role.underlay),
            },
          ]}
        >
          <Icon
            color={
              danger ? theme.role.danger : (iconColor ?? theme.role.primary)
            }
            name={icon}
            size={21}
          />
        </View>
      )}
      <View style={styles.rowCopy}>
        <Typography.Body2
          {...wholeWordFit(title)}
          $fontWeight={selected ? 'bold' : 'normal'}
          style={{color: danger ? theme.role.danger : theme.text.basic}}
        >
          {title}
        </Typography.Body2>
        {detail === undefined ? null : (
          <Typography.Body4 numberOfLines={2} style={{color: theme.text.label}}>
            {detail}
          </Typography.Body4>
        )}
      </View>
      {loading ? (
        <LoadingIndicator color={theme.role.primary} size="small" />
      ) : (
        (trailing ??
        (choice ? (
          <SelectionRadio selected={selected} />
        ) : onPress === undefined ? null : (
          <Icon color={theme.text.placeholder} name="CaretRight" size={17} />
        )))
      )}
    </>
  );

  if (onPress === undefined)
    return (
      <View style={[styles.row, disabled && styles.disabled]} testID={testID}>
        {content}
      </View>
    );

  return (
    <CustomPressable
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole={accessibilityRole ?? (choice ? 'radio' : 'button')}
      accessibilityState={{
        busy: loading,
        checked: choice ? selected : selected || undefined,
        disabled: disabled || loading,
      }}
      disabled={disabled || loading}
      onPress={onPress}
      testID={testID}
      style={[
        styles.row,
        {
          backgroundColor: theme.bg.basic,
        },
        disabled && styles.disabled,
      ]}
    >
      {content}
    </CustomPressable>
  );
}

export function SettingsToggleRow({
  detail,
  disabled = false,
  icon,
  loading = false,
  onChange,
  title,
  value,
}: {
  readonly detail?: string;
  readonly disabled?: boolean;
  readonly icon: IconName;
  readonly loading?: boolean;
  readonly onChange: (value: boolean) => void;
  readonly title: string;
  readonly value: boolean;
}): ReactElement {
  return (
    <SettingsRow
      detail={detail}
      disabled={disabled}
      icon={icon}
      loading={loading}
      onPress={disabled ? undefined : () => onChange(!value)}
      title={title}
      trailing={
        <View pointerEvents="none">
          <SwitchToggle accessibilityLabel={title} isOn={value} size="small" />
        </View>
      }
    />
  );
}

export function SettingsActionRow({
  disabled = false,
  loading = false,
  onPress,
  title,
  tone = 'danger',
}: {
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly onPress: () => void;
  readonly title: string;
  readonly tone?: 'danger' | 'primary';
}): ReactElement {
  const {theme} = useCPK();
  const color = tone === 'danger' ? theme.role.danger : theme.role.primary;

  return (
    <CustomPressable
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={{busy: loading, disabled: disabled || loading}}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.actionRow,
        {backgroundColor: theme.bg.basic},
        disabled && styles.disabled,
      ]}
    >
      {loading ? (
        <LoadingIndicator color={color} size="small" />
      ) : (
        <Typography.Body2 $fontWeight="bold" style={{color}}>
          {title}
        </Typography.Body2>
      )}
    </CustomPressable>
  );
}

export function SettingsStatus({
  body,
  icon,
  title,
  tone = 'neutral',
}: {
  readonly body?: string;
  readonly icon: IconName;
  readonly title: string;
  readonly tone?: 'danger' | 'neutral' | 'success';
}): ReactElement {
  const {theme} = useCPK();
  const color =
    tone === 'danger'
      ? theme.role.danger
      : tone === 'success'
        ? theme.role.success
        : theme.text.label;

  return (
    <View style={styles.status}>
      <View style={[styles.statusIcon, {backgroundColor: theme.role.underlay}]}>
        <Icon color={color} name={icon} size={25} />
      </View>
      <View style={styles.statusCopy}>
        <Typography.Heading4 $fontWeight="bold">{title}</Typography.Heading4>
        {body === undefined ? null : (
          <Typography.Body3 style={{color: theme.text.label}}>
            {body}
          </Typography.Body3>
        )}
      </View>
    </View>
  );
}

/** Settings rows, section headers and list footers share one centered column. */
const SETTINGS_COLUMN_MAX_WIDTH = 680;

const styles = StyleSheet.create({
  actionRow: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  column: {alignSelf: 'center', gap: 16, maxWidth: SETTINGS_COLUMN_MAX_WIDTH, width: '100%'},
  disabled: {opacity: 0.46},
  divider: {height: StyleSheet.hairlineWidth},
  footer: {
    alignSelf: 'stretch',
  },
  hero: {alignItems: 'center', flexDirection: 'row', gap: 10},
  heroCopy: {flex: 1},
  heroIcon: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 13,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  page: {flex: 1},
  pageContent: {paddingHorizontal: 16, paddingTop: DETAIL_CONTENT_TOP},
  row: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  rowCopy: {flex: 1, gap: 2},
  rowIcon: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 11,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  scroll: {flex: 1},
  section: {gap: 8},
  sectionCard: {
    borderCurve: 'continuous',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sectionFooter: {lineHeight: 18, paddingHorizontal: 12},
  sectionListHeader: {
    alignSelf: 'center',
    maxWidth: SETTINGS_COLUMN_MAX_WIDTH,
    paddingBottom: 8,
    paddingHorizontal: 12,
    paddingTop: 16,
    width: '100%',
  },
  sectionListRow: {
    alignSelf: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    maxWidth: SETTINGS_COLUMN_MAX_WIDTH,
    overflow: 'hidden',
    width: '100%',
  },
  fullWidthColumn: {maxWidth: undefined},
  listFooter: {alignSelf: 'center', maxWidth: SETTINGS_COLUMN_MAX_WIDTH, width: '100%'},
  sectionListRowFirst: {
    borderCurve: 'continuous',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sectionListSeparated: {marginTop: 24},
  sectionListRowLast: {
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: {paddingHorizontal: 12},
  status: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  statusCopy: {flex: 1, gap: 6, paddingTop: 2},
  statusIcon: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 20,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
});
