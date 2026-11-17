import type {ReactElement} from 'react';
import {Image, StyleSheet, View} from 'react-native';
import {useRouter} from 'expo-router';
import {Icon, Typography, useCPK} from 'cpk-ui';

import {useSession} from '~/features/auth/session';
import {AppScreen, ScreenSkeleton} from '~/features/ledger/ui';
import {
  SettingsDivider,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from '~/features/settings/ui';
import {t} from '~/utils/i18n';

export function MyProfileScreen(): ReactElement {
  const router = useRouter();
  const {theme} = useCPK();
  const {user} = useSession();

  if (user === null)
    return (
      <AppScreen>
        <ScreenSkeleton rows={4} />
      </AppScreen>
    );

  const bio = user.bio?.trim() ?? '';

  return (
    <SettingsPage testID="my-profile-screen">
      <View
        style={[
          styles.identityCard,
          {backgroundColor: theme.bg.basic, borderColor: theme.role.border},
        ]}
      >
        <View
          style={[styles.avatarFrame, {backgroundColor: theme.role.underlay}]}
        >
          {user.avatar === null ? (
            <Icon color={theme.role.primary} name="User" size={42} />
          ) : (
            <Image source={{uri: user.avatar}} style={styles.avatar} />
          )}
        </View>
        <Typography.Heading2
          $fontWeight="bold"
          numberOfLines={1}
          style={styles.name}
        >
          {user.displayName}
        </Typography.Heading2>
        {user.handle === null ? null : (
          <Typography.Body2 style={{color: theme.role.primary}}>
            @{user.handle}
          </Typography.Body2>
        )}
        {bio.length === 0 ? null : (
          <Typography.Body3 style={[styles.bio, {color: theme.text.label}]}>
            {bio}
          </Typography.Body3>
        )}
      </View>

      <SettingsSection>
        <SettingsRow
          detail={user.displayName}
          icon="UserCircle"
          onPress={() => router.navigate('/profile/edit')}
          title={t('settings.profileEdit')}
        />
        <SettingsDivider />
        <SettingsRow
          detail={user.handle === null ? undefined : `@${user.handle}`}
          icon="At"
          onPress={() => router.navigate('/profile/handle')}
          title={t('settings.profileHandle')}
        />
      </SettingsSection>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  avatar: {borderRadius: 44, height: 88, width: 88},
  avatarFrame: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 44,
    height: 88,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 88,
  },
  bio: {lineHeight: 21, maxWidth: 340, textAlign: 'center'},
  identityCard: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 5,
    paddingHorizontal: 22,
    paddingVertical: 24,
  },
  name: {maxWidth: '100%', textAlign: 'center'},
});
