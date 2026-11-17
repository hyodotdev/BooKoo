const ICON_CELL_MIN = 74;

/**
 * Width of each cell in an icon grid that shares a measured row. 74pt fits
 * the longest preset word ("Maintenance") on one line; fixed 51–71pt cells
 * ellipsized it or broke it inside the word. Before the row is measured, or
 * while it measures zero, cells take the minimum width.
 */
export function iconCellWidth(rowWidth: number | null, gap: number): number {
  if (rowWidth === null || rowWidth <= 0) return ICON_CELL_MIN;
  const columns = Math.max(
    1,
    Math.floor((rowWidth + gap) / (ICON_CELL_MIN + gap)),
  );
  return Math.floor((rowWidth - gap * (columns - 1)) / columns);
}
