import {getBottomTabIndicatorGeometry} from '../../../../src/features/ledger/tabBar';

describe('ledger tab indicator', () => {
  it('centres one fixed-width pill in each visible tab slot', () => {
    expect(
      getBottomTabIndicatorGeometry({
        barWidth: 400,
        selectedIndex: 0,
        visibleTabCount: 4,
      }),
    ).toEqual({translateX: 22, width: 56});
    expect(
      getBottomTabIndicatorGeometry({
        barWidth: 400,
        selectedIndex: 3,
        visibleTabCount: 4,
      }),
    ).toEqual({translateX: 322, width: 56});
  });

  it('collapses safely before layout and for an empty tab set', () => {
    expect(
      getBottomTabIndicatorGeometry({
        barWidth: 0,
        selectedIndex: 0,
        visibleTabCount: 4,
      }),
    ).toEqual({translateX: 0, width: 0});
    expect(
      getBottomTabIndicatorGeometry({
        barWidth: 400,
        selectedIndex: 0,
        visibleTabCount: 0,
      }),
    ).toEqual({translateX: 0, width: 0});
  });
});
