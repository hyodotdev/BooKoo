import type {ReactElement} from 'react';
import {Linking} from 'react-native';
import {useLocalSearchParams} from 'expo-router';
import {Button, Typography} from 'cpk-ui';
import {AppScreen, FormFrame} from '~/features/ledger/ui';
import {t} from '~/utils/i18n';

export default function PlaceRoute(): ReactElement {
  const {label = '', lat, lng, address} = useLocalSearchParams<{
    label?: string;
    lat?: string;
    lng?: string;
    address?: string;
  }>();
  const latitude = Number(lat);
  const longitude = Number(lng);
  const valid = Number.isFinite(latitude) && Number.isFinite(longitude);
  return <AppScreen><FormFrame>
    <Typography.Heading3 $fontWeight="bold">{label}</Typography.Heading3>
    {address === undefined ? null : <Typography.Body3>{address}</Typography.Body3>}
    <Button disabled={!valid} onPress={() => {if (valid) void Linking.openURL(`https://maps.apple.com/?ll=${latitude},${longitude}`);}} text={t('release.openMaps')} />
  </FormFrame></AppScreen>;
}
