import {create} from 'zustand';

export interface EntryPlace {
  readonly label: string;
  readonly lat: number;
  readonly lng: number;
  readonly address?: string;
  readonly countryCode?: string;
}

interface CategorySelection {
  readonly categoryKey: string;
  readonly ledgerId: string;
}

interface PlaceSelection {
  readonly ledgerId: string;
  readonly place: EntryPlace | null;
}

interface EntryPickerState {
  readonly categorySelection: CategorySelection | null;
  readonly placeSelection: PlaceSelection | null;
}

interface EntryPickerActions {
  readonly clearCategorySelection: () => void;
  readonly clearPlaceSelection: () => void;
  readonly selectCategory: (selection: CategorySelection) => void;
  readonly selectPlace: (selection: PlaceSelection) => void;
}

const initialState: EntryPickerState = {
  categorySelection: null,
  placeSelection: null,
};

export const useEntryPickerStore = create<
  EntryPickerState & EntryPickerActions
>()((set) => ({
  ...initialState,
  clearCategorySelection: () => set({categorySelection: null}),
  clearPlaceSelection: () => set({placeSelection: null}),
  selectCategory: (categorySelection) => set({categorySelection}),
  selectPlace: (placeSelection) => set({placeSelection}),
}));
