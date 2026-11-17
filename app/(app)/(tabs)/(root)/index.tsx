import type {ReactElement} from 'react';
import {useCalendarScreenProps} from '~/features/ledger/screens/calendar';
import {useTabletLayout} from '~/hooks/useTabletLayout';
import CalendarMobile from '../../_Tabs/TabCalendar/TabCalendarMobile';
import CalendarTablet from '../../_Tabs/TabCalendar/TabCalendarTablet';

export default function CalendarRoute(): ReactElement {
  const isTablet = useTabletLayout();
  const props = useCalendarScreenProps();
  return isTablet ? (
    <CalendarTablet {...props} />
  ) : (
    <CalendarMobile {...props} />
  );
}
