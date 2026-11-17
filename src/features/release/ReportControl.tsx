import type {ReactElement} from 'react';
import {useState} from 'react';
import {Modal, ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useMutation} from 'convex/react';
import {Button, EditText, Typography, useCPK} from 'cpk-ui';

import {api} from '@convex/_generated/api';
import type {Id} from '@convex/_generated/dataModel';
import {showNotice} from '~/utils/alert';
import {t} from '~/utils/i18n';

type ReportReason =
  | 'SPAM'
  | 'HARASSMENT'
  | 'IMPERSONATION'
  | 'SEXUAL'
  | 'FRAUD'
  | 'PRIVACY'
  | 'OTHER';

type ReportSubject =
  | {readonly kind: 'USER'; readonly userId: Id<'users'>}
  | {readonly kind: 'LEDGER'; readonly ledgerId: Id<'ledgers'>}
  | {readonly kind: 'ITEM'; readonly itemId: Id<'ledgerItems'>}
  | {readonly kind: 'COMMENT'; readonly commentId: Id<'itemComments'>};

const REASONS: readonly ReportReason[] = [
  'SPAM',
  'HARASSMENT',
  'IMPERSONATION',
  'SEXUAL',
  'FRAUD',
  'PRIVACY',
  'OTHER',
];

const reasonLabel = (reason: ReportReason): string => {
  switch (reason) {
    case 'SPAM':
      return t('release.reportReasonSpam');
    case 'HARASSMENT':
      return t('release.reportReasonHarassment');
    case 'IMPERSONATION':
      return t('release.reportReasonImpersonation');
    case 'SEXUAL':
      return t('release.reportReasonSexual');
    case 'FRAUD':
      return t('release.reportReasonFraud');
    case 'PRIVACY':
      return t('release.reportReasonPrivacy');
    case 'OTHER':
      return t('release.reportReasonOther');
  }
};

export function ReportControl({
  subject,
  contextLedgerId,
  blockUserId,
  onVisibleChange,
  showTrigger = true,
  visible: visibleProp,
}: {
  readonly subject: ReportSubject;
  readonly contextLedgerId?: Id<'ledgers'>;
  readonly blockUserId?: Id<'users'>;
  readonly onVisibleChange?: (visible: boolean) => void;
  readonly showTrigger?: boolean;
  readonly visible?: boolean;
}): ReactElement {
  const {theme} = useCPK();
  const create = useMutation(api.reports.mutations.create);
  const block = useMutation(api.blocks.mutations.create);
  const [internalVisible, setInternalVisible] = useState(false);
  const [reason, setReason] = useState<ReportReason>('OTHER');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const visible = visibleProp ?? internalVisible;
  const setVisible = (next: boolean): void => {
    if (visibleProp === undefined) setInternalVisible(next);
    onVisibleChange?.(next);
  };

  const submit = async (): Promise<void> => {
    if (sending) return;
    setSending(true);
    try {
      await create({
        subject,
        reason,
        ...(contextLedgerId === undefined ? {} : {contextLedgerId}),
        ...(note.trim().length === 0 ? {} : {note: note.trim()}),
      });
      setVisible(false);
      setNote('');
      showNotice(t('release.reportReceived'), t('release.reportReceivedBody'));
    } catch {
      showNotice(t('common.warning'), t('error.generic'));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {showTrigger ? (
        <Button
          onPress={() => setVisible(true)}
          text={t('release.report')}
          type="text"
        />
      ) : null}
      <Modal
        animationType="slide"
        onRequestClose={() => setVisible(false)}
        presentationStyle="pageSheet"
        visible={visible}
      >
        <SafeAreaView
          accessibilityViewIsModal
          style={[styles.modal, {backgroundColor: theme.bg.paper}]}
        >
          <View style={styles.header}>
            <Typography.Heading3 $fontWeight="bold">
              {t('release.report')}
            </Typography.Heading3>
            <Button
              onPress={() => setVisible(false)}
              text={t('a11y.close')}
              type="text"
            />
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            <Typography.Body3 style={{color: theme.text.label}}>
              {t('release.reportDisclosure')}
            </Typography.Body3>
            {REASONS.map((value) => (
              <Button
                key={value}
                onPress={() => setReason(value)}
                text={reasonLabel(value)}
                type={reason === value ? 'solid' : 'outlined'}
              />
            ))}
            <EditText
              decoration="boxed"
              hideCounter
              label={t('release.reportDetails')}
              maxLength={500}
              multiline
              onChangeText={setNote}
              value={note}
            />
            {blockUserId === undefined ? null : (
              <Button
                color="danger"
                onPress={() =>
                  void block({userId: blockUserId}).then(() =>
                    setVisible(false),
                  )
                }
                text={t('release.block')}
                type="outlined"
              />
            )}
            <Button
              loading={sending}
              onPress={() => void submit()}
              text={t('common.send')}
            />
            <Button
              onPress={() => setVisible(false)}
              text={t('common.cancel')}
              type="text"
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  content: {gap: 10, paddingVertical: 16},
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modal: {flex: 1, padding: 20},
});
