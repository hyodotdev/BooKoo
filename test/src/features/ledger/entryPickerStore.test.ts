import {useEntryPickerStore} from '~/features/ledger/entryPickerStore';

describe('entry picker handoff', () => {
  afterEach(() => {
    const state = useEntryPickerStore.getState();
    state.clearCategorySelection();
    state.clearPlaceSelection();
  });

  it('keeps category and place selections scoped to their ledger', () => {
    const state = useEntryPickerStore.getState();
    state.selectCategory({categoryKey: 'cafe', ledgerId: 'ledger-a'});
    state.selectPlace({
      ledgerId: 'ledger-a',
      place: {label: 'Seoul', lat: 37.5665, lng: 126.978},
    });

    expect(useEntryPickerStore.getState()).toMatchObject({
      categorySelection: {categoryKey: 'cafe', ledgerId: 'ledger-a'},
      placeSelection: {
        ledgerId: 'ledger-a',
        place: {label: 'Seoul', lat: 37.5665, lng: 126.978},
      },
    });
  });

  it('supports explicitly removing a previously stored place', () => {
    useEntryPickerStore
      .getState()
      .selectPlace({ledgerId: 'ledger-a', place: null});

    expect(useEntryPickerStore.getState().placeSelection).toEqual({
      ledgerId: 'ledger-a',
      place: null,
    });
  });
});
