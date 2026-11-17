import type {ReactElement} from 'react';
import {StatusBar, StyleSheet, View} from 'react-native';
import {CustomPressable, Icon, Typography, useCPK, type IconName} from 'cpk-ui';
import {SafeAreaView} from 'react-native-safe-area-context';

import {BookooButton} from './BookooButton';
import {BOOKOO_PALETTE} from '~/theme/bookooPalette';
import {
  brandLedgerSurface,
  ledgerAccentSurface,
  LEDGER_ACCENTS,
} from '~/theme/ledgerAccent';
import {statusBarStyleForTheme} from '~/theme/statusBar';

interface RecoveryAction {
  readonly disabled?: boolean;
  readonly label: string;
  readonly loading?: boolean;
  readonly onPress: () => void;
}

export function BookooRecoveryScreen({
  body,
  code,
  icon,
  primaryAction,
  secondaryAction,
  testID,
  title,
}: {
  readonly body: string;
  readonly code: string;
  readonly icon: IconName;
  readonly primaryAction: RecoveryAction;
  readonly secondaryAction?: RecoveryAction;
  readonly testID: string;
  readonly title: string;
  readonly tone?: 'danger' | 'primary';
}): ReactElement {
  const {theme, themeType} = useCPK();
  const mode = themeType === 'dark' ? 'dark' : 'light';
  const surface = brandLedgerSurface(mode);
  const actionAccent = LEDGER_ACCENTS.TEAL[mode];
  const actionColor = ledgerAccentSurface(actionAccent, mode).background;
  const statusBarStyle = statusBarStyleForTheme(themeType);
  const primaryBusy = primaryAction.loading === true;

  return (
    <View
      accessibilityLabel={title}
      style={[styles.screen, {backgroundColor: theme.bg.paper}]}
      testID={testID}
    >
      <StatusBar
        backgroundColor={surface.background}
        barStyle={statusBarStyle}
        hidden={false}
      />
      <SafeAreaView
        edges={['top']}
        style={{backgroundColor: surface.background}}
      >
        <View
          accessibilityLabel={code}
          style={[styles.header, {backgroundColor: surface.background}]}
          testID={`${testID}-header`}
        />
      </SafeAreaView>
      <View style={styles.content}>
        <View
          style={[styles.mark, {backgroundColor: BOOKOO_PALETTE.white}]}
          testID={`${testID}-mark`}
        >
          <Icon color={actionColor} name={icon} size={36} />
        </View>
        <Typography.Heading4
          style={[styles.title, {color: theme.text.placeholder}]}
        >
          {title}
        </Typography.Heading4>
        <Typography.Body2
          style={[styles.body, {color: theme.text.placeholder}]}
        >
          {body}
        </Typography.Body2>
        {primaryBusy ? (
          <BookooButton
            accent={actionAccent}
            borderRadius={32}
            disabled={primaryAction.disabled}
            loading
            onPress={primaryAction.onPress}
            style={styles.action}
            text={primaryAction.label}
            type="outlined"
          />
        ) : (
          <CustomPressable
            accessibilityLabel={primaryAction.label}
            accessibilityRole="button"
            disabled={primaryAction.disabled}
            onPress={primaryAction.onPress}
            style={[styles.outlinedAction, {borderColor: actionColor}]}
          >
            <Typography.Heading4
              style={[styles.actionLabel, {color: actionColor}]}
            >
              {primaryAction.label}
            </Typography.Heading4>
          </CustomPressable>
        )}
        {secondaryAction === undefined ? null : (
          <CustomPressable
            accessibilityLabel={secondaryAction.label}
            accessibilityRole="button"
            disabled={secondaryAction.disabled}
            onPress={secondaryAction.onPress}
            style={styles.textAction}
          >
            <Typography.Body2
              $fontWeight="bold"
              style={{color: theme.text.label}}
            >
              {secondaryAction.label}
            </Typography.Body2>
          </CustomPressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {marginTop: 24, minWidth: 160},
  actionLabel: {fontSize: 20, textAlign: 'center'},
  body: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 8,
    textAlign: 'center',
  },
  content: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 56,
    paddingHorizontal: 24,
  },
  header: {height: 56},
  mark: {
    alignItems: 'center',
    borderRadius: 40,
    height: 80,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 80,
  },
  outlinedAction: {
    alignItems: 'center',
    borderRadius: 32,
    borderCurve: 'continuous',
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 56,
    minWidth: 160,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  screen: {flex: 1},
  textAction: {
    marginTop: 16,
    borderCurve: 'continuous',
    borderRadius: 22,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: {
    fontSize: 20,
    lineHeight: 28,
    marginTop: 20,
    textAlign: 'center',
  },
});
