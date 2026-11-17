import {Platform} from 'react-native';

const SHEET_OPTIONS = {
  headerShown: false,
  presentation: 'formSheet',
  sheetGrabberVisible: true,
  sheetInitialDetentIndex: 0,
} as const;

type CategorySheetOptions = typeof SHEET_OPTIONS & {
  sheetAllowedDetents: number[];
};

export function getEntryCategorySheetOptions(
  mode: 'picker' | 'create',
  platform: typeof Platform.OS = Platform.OS,
): CategorySheetOptions {
  return {
    ...SHEET_OPTIONS,
    // Android lays out a multi-detent sheet at its largest height. A fixed
    // Save footer would sit below the visible smaller detent of the form.
    sheetAllowedDetents:
      mode === 'create' && platform === 'android' ? [0.92] : [0.62, 0.92],
  };
}

export const ENTRY_CATEGORY_SHEET_OPTIONS =
  getEntryCategorySheetOptions('picker');
export const ENTRY_CATEGORY_CREATE_SHEET_OPTIONS =
  getEntryCategorySheetOptions('create');
