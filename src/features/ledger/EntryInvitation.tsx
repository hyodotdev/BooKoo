import type {ReactElement} from 'react';
import {StyleSheet, View} from 'react-native';
import {Card, Icon, Typography, useCPK} from 'cpk-ui';

import {BookooButton} from '~/components/uis/BookooButton';
import {useLocale} from '~/hooks/useLocale';
import {useLedgerAccent} from '~/theme/ledgerAccentProvider';
import {ledgerAccentSurface} from '~/theme/ledgerAccent';
import {t} from '~/utils/i18n';

/** The empty ledger pane's next action, using cpk-ui's visual primitives. */
export function EntryInvitation({
  onAdd,
  actionTestID,
}: {
  readonly onAdd: () => void;
  readonly actionTestID: string;
}): ReactElement {
  useLocale();
  const {theme, themeType} = useCPK();
  const accent = useLedgerAccent();
  const surface = ledgerAccentSurface(
    accent,
    themeType === 'dark' ? 'dark' : 'light',
  );

  return (
    <View style={styles.content} testID="entry-invitation">
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Card
          backgroundColor={accent.subtle}
          borderRadius={28}
          elevation={0}
          padding={24}
          style={styles.mark}
        >
          <Icon color={accent.text} name="NotePencil" size={40} />
        </Card>
      </View>
      <Typography.Heading4 style={[styles.title, {color: theme.text.basic}]}>
        {t('ledgerItem.entryInvitation')}
      </Typography.Heading4>
      <BookooButton
        borderRadius={24}
        onPress={onAdd}
        startElement={
          <View style={styles.actionIcon} testID="entry-invitation-add-icon">
            <Icon color={surface.foreground} name="Plus" size={20} />
          </View>
        }
        style={styles.action}
        styles={{container: styles.actionContainer}}
        testID={actionTestID}
        text={t('a11y.addEntry')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    alignSelf: 'center',
    gap: 24,
    maxWidth: 360,
    paddingHorizontal: 24,
    paddingVertical: 32,
    width: '100%',
  },
  mark: {transform: [{rotate: '-6deg'}]},
  title: {textAlign: 'center'},
  action: {alignSelf: 'center', maxWidth: '100%'},
  actionContainer: {minHeight: 48, paddingHorizontal: 24},
  actionIcon: {backgroundColor: 'transparent'},
});
