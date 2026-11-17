import {iconCellWidth} from '../../../../src/components/uis/iconGrid';

describe('icon grid', () => {
  it('shares the measured row between cells of at least 74pt', () => {
    expect(iconCellWidth(null, 8)).toBe(74);
    expect(iconCellWidth(0, 8)).toBe(74);
    expect(iconCellWidth(327, 8)).toBe(75);
    expect(iconCellWidth(354, 8)).toBe(82);
    expect(iconCellWidth(540, 8)).toBe(83);
  });
});
