import type {ReactElement} from 'react';
import {Stack, useRouter} from 'expo-router';
import {Icon, IconButton, useCPK} from 'cpk-ui';

import {LedgersScreen} from '~/features/ledger/screens/ledgers';
import {t} from '~/utils/i18n';

export default function LedgersRoute(): ReactElement {
  const router = useRouter();
  const {theme} = useCPK();
  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              accessibilityLabel={t('ledger.add')}
              iconElement={
                <Icon color={theme.role.primary} name="Plus" size={24} />
              }
              onPress={() => router.navigate('/ledgers/new')}
              size={24}
              type="text"
            />
          ),
        }}
      />
      <LedgersScreen />
    </>
  );
}
