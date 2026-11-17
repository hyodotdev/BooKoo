import {create} from 'zustand';

import {Storage, storage} from '~/utils/storage';

interface LedgerState {
  activeLedgerId: string | null;
}

interface LedgerActions {
  setActiveLedgerId: (ledgerId: string | null) => void;
}

const initialState: LedgerState = {
  activeLedgerId: storage.getString(Storage.ActiveLedgerId) ?? null,
};

export const useLedgerStore = create<LedgerState & LedgerActions>()((set) => ({
  ...initialState,
  setActiveLedgerId: (activeLedgerId) => {
    if (activeLedgerId === null) storage.delete(Storage.ActiveLedgerId);
    else storage.set(Storage.ActiveLedgerId, activeLedgerId);
    set({activeLedgerId});
  },
}));
