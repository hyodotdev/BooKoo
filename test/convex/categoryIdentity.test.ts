import {categoryIdentityPatch} from '../../convex/lib/categoryMutations';

describe('category identity write compatibility', () => {
  const custom = {source: 'CUSTOM' as const, label: 'Shared dinners'};
  it('preserves an unchanged old label when changing appearance', () => {
    expect(
      categoryIdentityPatch(custom, {
        label: custom.label,
        iconKey: 'Coffee',
        colorToken: 'category.purple',
      }),
    ).toEqual({
      label: 'Shared dinners',
      iconKey: 'Coffee',
      colorToken: 'category.purple',
    });
  });
  it('normalizes renamed labels and does not overwrite appearance for old clients', () => {
    expect(categoryIdentityPatch(custom, {label: 'New name'})).toEqual({
      label: 'Newname',
    });
  });
  it('retains the preset reset-to-localized-name contract', () => {
    expect(
      categoryIdentityPatch(
        {source: 'PRESET', label: 'Custom'},
        {iconKey: 'Coffee'},
      ),
    ).toEqual({label: undefined, iconKey: 'Coffee'});
  });
  it.each([
    {iconKey: 'invalid'},
    {colorToken: '#ffffff'},
    {label: ''},
    {label: ' '.repeat(4)},
    {label: 'x'.repeat(41)},
  ])('rejects invalid identity fields: %s', (fields) => {
    expect(() =>
      categoryIdentityPatch(custom, {label: 'Valid', ...fields}),
    ).toThrow();
  });
  it('does not let custom categories lose their name', () => {
    expect(() => categoryIdentityPatch(custom, {iconKey: 'Coffee'})).toThrow();
  });
  // `rename` writes a CATEGORY_RENAMED audit row only when this predicate is
  // true, so an icon/colour tap must not claim the category was renamed.
  it('marks only real renames for the audit log', () => {
    expect(
      categoryIdentityPatch(custom, {label: custom.label, iconKey: 'Coffee'})
        .label,
    ).toBe(custom.label);
    expect(categoryIdentityPatch(custom, {label: 'Other'}).label).not.toBe(
      custom.label,
    );
    expect(
      categoryIdentityPatch({source: 'PRESET', label: 'Custom'}, {}).label,
    ).not.toBe('Custom');
  });
  it.each([{archivedAt: 1}, {reassignJobKey: 'in-progress'}])(
    'rejects editing a retired or reassigning category: %s',
    (state) => {
      expect(() =>
        categoryIdentityPatch({...custom, ...state}, {label: 'Valid'}),
      ).toThrow();
    },
  );
});
