import type {ReactElement} from 'react';
import {
  timelineRouteKey,
  useTimelineScreenProps,
} from '~/features/ledger/screens/timeline';
import {useActiveLedger} from '~/features/ledger/useActiveLedger';
import {useTabletLayout} from '~/hooks/useTabletLayout';
import TimelineMobile from '../../_Tabs/TabTimeline/TabTimelineMobile';
import TimelineTablet from '../../_Tabs/TabTimeline/TabTimelineTablet';

function TimelineRouteContent({isTablet}: {isTablet: boolean}): ReactElement {
  const props = useTimelineScreenProps(isTablet);
  return isTablet ? (
    <TimelineTablet {...props} />
  ) : (
    <TimelineMobile {...props} />
  );
}

export default function TimelineRoute(): ReactElement {
  const isTablet = useTabletLayout();
  const {activeLedger} = useActiveLedger();
  const activeLedgerId =
    activeLedger === undefined
      ? undefined
      : activeLedger === null
        ? null
        : activeLedger.id;

  // Pagination/filter state and tablet selection are ledger-scoped. A key is
  // the React-native way to reset the complete local window synchronously on
  // drawer selection, including when the user later returns to an old ledger.
  return (
    <TimelineRouteContent
      key={timelineRouteKey(activeLedgerId)}
      isTablet={isTablet}
    />
  );
}
