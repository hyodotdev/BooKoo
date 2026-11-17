import type {ReactElement} from 'react';
import {useStatsScreenProps} from '~/features/ledger/screens/stats';
import {useTabletLayout} from '~/hooks/useTabletLayout';
import StatsMobile from '../../_Tabs/TabStats/TabStatsMobile';
import StatsTablet from '../../_Tabs/TabStats/TabStatsTablet';

export default function StatsRoute(): ReactElement {
  const isTablet = useTabletLayout();
  const props = useStatsScreenProps();
  return isTablet ? <StatsTablet {...props} /> : <StatsMobile {...props} />;
}
