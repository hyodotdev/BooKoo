import type {PropsWithChildren, ReactElement} from 'react';
import {createContext, useContext, useMemo} from 'react';
import {useCPK} from 'cpk-ui';

import {useActiveLedger} from '~/features/ledger/useActiveLedger';
import {
  BRAND_LEDGER_COLOR,
  LEDGER_ACCENTS,
  type AccentSet,
  type LedgerColorKey,
} from './ledgerAccent';

interface LedgerAccentContextValue {
  readonly accent: AccentSet;
  readonly actionAccent: AccentSet;
}

const Context = createContext<LedgerAccentContextValue | null>(null);

export function LedgerAccentProvider({
  children,
}: PropsWithChildren): ReactElement {
  const {themeType} = useCPK();
  const {activeLedger} = useActiveLedger();
  const value = useMemo(() => {
    const color = (activeLedger?.colorKey ??
      BRAND_LEDGER_COLOR) as LedgerColorKey;
    const mode = themeType === 'dark' ? 'dark' : 'light';
    return {
      accent: LEDGER_ACCENTS[color][mode],
      actionAccent: LEDGER_ACCENTS[color][mode],
    };
  }, [activeLedger?.colorKey, themeType]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useLedgerAccent = (): AccentSet => {
  const value = useContext(Context);
  const {themeType} = useCPK();
  return (
    value?.accent ??
    LEDGER_ACCENTS[BRAND_LEDGER_COLOR][themeType === 'dark' ? 'dark' : 'light']
  );
};

export const useLedgerActionAccent = (): AccentSet => {
  const value = useContext(Context);
  const {themeType} = useCPK();
  return (
    value?.actionAccent ??
    LEDGER_ACCENTS[BRAND_LEDGER_COLOR][themeType === 'dark' ? 'dark' : 'light']
  );
};
