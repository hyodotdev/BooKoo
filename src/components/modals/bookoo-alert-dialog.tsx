import {useCallback, useMemo} from 'react';
import {StyleSheet, useWindowDimensions, View} from 'react-native';
import {Icon, Typography, useCPK, type IconName} from 'cpk-ui';
import type {ButtonColorType} from 'cpk-ui/components/uis/Button/Button';

import {BookooButton} from '~/components/uis/BookooButton';
import {t} from '~/utils/i18n';

export interface BookooAlertDialogOptions {
  readonly body: string;
  readonly cancelText?: string;
  readonly confirmText: string;
  readonly icon: IconName;
  readonly onConfirm: () => void;
  readonly title: string;
  readonly tone?: ButtonColorType;
}

/**
 * BooKoo's confirmation pattern on top of cpk-ui AlertDialog.
 *
 * Keeping this in one place prevents destructive actions from drifting into
 * unrelated native-alert layouts. The compact card also stays readable on
 * phones and never stretches across a tablet.
 */
export function useBookooAlertDialog(): {
  readonly close: () => void;
  readonly confirm: (options: BookooAlertDialogOptions) => void;
} {
  const {alertDialog, theme} = useCPK();
  const {height} = useWindowDimensions();
  const compact = height < 500;

  const confirm = useCallback(
    ({
      body,
      cancelText = t('common.cancel'),
      confirmText,
      icon,
      onConfirm,
      title,
      tone = 'primary',
    }: BookooAlertDialogOptions): void => {
      alertDialog.open({
        title,
        renderActions: ({close}) => [
          <BookooButton
            accessibilityLabel={cancelText}
            color="light"
            key="cancel"
            onPress={close}
            size="small"
            style={styles.action}
            styles={{
              container: styles.actionButton,
              content: styles.actionContent,
            }}
            text={
              <Typography.Body2
                $fontWeight="bold"
                style={[styles.actionText, {color: theme.text.label}]}
              >
                {cancelText}
              </Typography.Body2>
            }
            type="text"
          />,
          <BookooButton
            accessibilityLabel={confirmText}
            color={tone}
            key="confirm"
            onPress={() => {
              close();
              onConfirm();
            }}
            size="small"
            style={styles.action}
            styles={{
              container: styles.actionButton,
              content: styles.actionContent,
            }}
            text={
              <Typography.Body2
                $fontWeight="bold"
                style={[styles.actionText, {color: theme.button[tone].bg}]}
              >
                {confirmText}
              </Typography.Body2>
            }
            type="text"
          />,
        ],
        backdropOpacity: 0.46,
        renderBody: () => (
          <Typography.Body2
            selectable
            style={[styles.body, {color: theme.text.label}]}
          >
            {body}
          </Typography.Body2>
        ),
        closeOnTouchOutside: false,
        showCloseButton: false,
        size: 'small',
        styles: {
          actionContainer: [styles.actions, compact && styles.compactActions],
          bodyContainer: styles.bodyContainer,
          container: [
            styles.container,
            {
              borderColor: theme.role.border,
              boxShadow: '0 16px 48px rgba(0, 0, 0, 0.18)',
            },
          ],
          titleContainer: styles.titleContainer,
        },
        renderHeader: () => (
          <View
            style={[styles.titleRow, compact && styles.compactTitle]}
            testID="bookoo-dialog-header"
          >
            <View
              style={[
                styles.icon,
                compact && styles.compactIcon,
                {backgroundColor: theme.button[tone].bg},
              ]}
              testID="bookoo-dialog-icon"
            >
              <Icon
                color={theme.button[tone].text}
                name={icon}
                size={compact ? 24 : 32}
              />
            </View>
            <Typography.Heading5
              $fontWeight="bold"
              numberOfLines={2}
              ellipsizeMode="tail"
              style={styles.title}
            >
              {title}
            </Typography.Heading5>
          </View>
        ),
      });
    },
    [alertDialog, compact, theme],
  );

  return useMemo(
    () => ({close: alertDialog.close, confirm}),
    [alertDialog.close, confirm],
  );
}

const styles = StyleSheet.create({
  action: {flex: 0, flexBasis: 'auto', flexShrink: 1, minWidth: 80},
  actionButton: {minHeight: 44, paddingHorizontal: 8, paddingVertical: 10},
  actionContent: {flexShrink: 1},
  actionText: {flexShrink: 1, fontWeight: '600', textAlign: 'center'},
  actions: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 32,
    paddingRight: 0,
  },
  body: {lineHeight: 24},
  bodyContainer: {marginBottom: 0, marginTop: 12},
  compactActions: {marginTop: 20},
  compactIcon: {height: 44, width: 44},
  compactTitle: {flexDirection: 'row', alignItems: 'center', gap: 16},
  container: {
    borderCurve: 'continuous',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 0,
    flexBasis: 'auto',
    maxWidth: 360,
    paddingTop: 28,
    paddingRight: 28,
    paddingBottom: 28,
    paddingLeft: 28,
    width: '88%',
  },
  icon: {
    alignItems: 'center',
    borderRadius: 32,
    flexShrink: 0,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  title: {flexShrink: 1, minWidth: 0},
  titleContainer: {alignItems: 'stretch'},
  // cpk-ui wraps this slot in a column. A flex:1 root collapses its intrinsic
  // height, hiding the title and letting the icon overlap the card and body.
  titleRow: {
    alignItems: 'flex-start',
    flexShrink: 0,
    gap: 20,
  },
});
