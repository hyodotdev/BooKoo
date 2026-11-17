import type {ReactElement} from 'react';
import {StyleSheet, View, type ImageStyle, type StyleProp} from 'react-native';
import {useAuthToken} from '@convex-dev/auth/react';
import {Image} from 'expo-image';
import {Icon, useCPK} from 'cpk-ui';

export function PrivateImage({
  photoId,
  variant = 'thumb',
  contentFit = 'cover',
  style,
  accessibilityLabel,
}: {
  readonly photoId: string;
  readonly variant?: 'thumb' | 'original';
  readonly contentFit?: 'cover' | 'contain';
  readonly style?: StyleProp<ImageStyle>;
  readonly accessibilityLabel: string;
}): ReactElement {
  const token = useAuthToken();
  const {theme} = useCPK();
  const origin = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;
  if (token === null || origin === undefined)
    return (
      <View
        accessibilityLabel={accessibilityLabel}
        style={[styles.fallback, {backgroundColor: theme.bg.skeleton}, style]}
      >
        <Icon color={theme.text.placeholder} name="Image" size={28} />
      </View>
    );
  return (
    <Image
      accessibilityLabel={accessibilityLabel}
      cachePolicy="memory"
      contentFit={contentFit}
      recyclingKey={`${photoId}:${variant}`}
      source={{
        uri: `${origin}/media/photo/${encodeURIComponent(photoId)}/${variant}`,
        headers: {Authorization: `Bearer ${token}`},
      }}
      style={style}
      transition={150}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {alignItems: 'center', justifyContent: 'center'},
});
