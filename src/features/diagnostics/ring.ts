import type {SupportedLocale} from '~/utils/i18n';

export type DiagnosticOperation =
  | 'ITEM_CREATE'
  | 'ITEM_UPDATE'
  | 'COMMENT_CREATE'
  | 'BOOT_CONFIG'
  | 'OTA_UPDATE';
export type DiagnosticBoundaryCode = 'UNEXPECTED' | 'BOOT_CONFIG_INVALID';

export type DiagnosticEvent =
  | {
      readonly kind: 'ADS';
      readonly outcome:
        | 'LOAD_REQUESTED'
        | 'LOADED'
        | 'DISPLAYED'
        | 'LOAD_FAILED'
        | 'DISPLAY_FAILED'
        | 'START_FAILED';
      readonly code: number | null;
    }
  | {
      readonly kind: 'APP_START';
      readonly durationBucket: '<450' | '450_900' | '901_1500' | '>1500';
      readonly hadHint: boolean;
    }
  | {
      readonly kind: 'BOUNDARY';
      readonly surface: 'ROOT' | 'TAB' | 'DETAIL';
      readonly code: DiagnosticBoundaryCode;
      readonly release: string;
    }
  | {
      readonly kind: 'WIRE_UNKNOWN';
      readonly operation: DiagnosticOperation;
      readonly release: string;
    }
  | {
      readonly kind: 'UPDATE';
      readonly outcome: 'CHECK_FAILED' | 'DOWNLOAD_FAILED' | 'EMERGENCY_LAUNCH';
    }
  | {readonly kind: 'INTL_CAPS'; readonly mask: number}
  | {
      readonly kind: 'MISSING_TRANSLATION';
      readonly keyHash: string;
      readonly locale: SupportedLocale;
    };

export interface DiagnosticRow {
  readonly at: number;
  readonly event: DiagnosticEvent;
}

const MAX_ROWS = 200;
const rows: DiagnosticRow[] = [];

export const diagnostic = (event: DiagnosticEvent): void => {
  const row = {at: Date.now(), event};
  rows.push(row);
  if (rows.length > MAX_ROWS) rows.splice(0, rows.length - MAX_ROWS);
};

export const diagnosticSnapshot = (): readonly DiagnosticRow[] =>
  rows.map((row) => ({...row, event: {...row.event}}));

export const clearDiagnostics = (): void => {
  rows.splice(0, rows.length);
};

export const diagnosticInternals = {maxRows: MAX_ROWS} as const;
