import {useState, type ReactElement} from 'react';
import {StyleSheet, View} from 'react-native';
import {useMutation} from 'convex/react';
import {Typography, useCPK} from 'cpk-ui';

import {api} from '@convex/_generated/api';
import {LEGAL_DOCUMENT_VERSION, PRIVACY_DOCUMENT_SHA256} from '@shared/legal';
import {useCurrentUser} from '~/features/auth/currentUser';
import {SettingsToggleRow} from '~/features/settings/ui';
import {useLocale} from '~/hooks/useLocale';
import {showNotice} from '~/utils/alert';
import {t} from '~/utils/i18n';

/** Domain preference only; cpk-ui owns the switch and settings-row rendering. */
export function CountryAnalyticsChoice(): ReactElement {
  useLocale();
  const user = useCurrentUser();
  const update = useMutation(api.user.mutations.setCountryAnalytics);
  const [busy, setBusy] = useState(false);
  const {theme} = useCPK();
  return (
    <View>
      <SettingsToggleRow
        disabled={busy || user == null}
        icon="GlobeHemisphereWest"
        loading={busy || user === undefined}
        onChange={(enabled) => {
          setBusy(true);
          void update({
            enabled,
            documentVersion: LEGAL_DOCUMENT_VERSION,
            documentSha256: PRIVACY_DOCUMENT_SHA256,
          })
            .catch(() => showNotice(t('common.warning'), t('error.generic')))
            .finally(() => setBusy(false));
        }}
        title={t('settings.countryAnalyticsTitle')}
        value={user?.countryAnalyticsEnabled === true}
      />
      <Typography.Body4 style={[styles.detail, {color: theme.text.label}]}>
        {t('settings.countryAnalyticsDetail')}
      </Typography.Body4>
    </View>
  );
}

const styles = StyleSheet.create({
  detail: {paddingHorizontal: 16, paddingBottom: 16},
});
