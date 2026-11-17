import type {ReactElement} from 'react';
import {ContentScreen} from '~/features/release/screens';

export default function AnnouncementsRoute(): ReactElement {
  return <ContentScreen kind="NOTICE" />;
}
