export const DISPLAY_NAME_MIN_LENGTH = 0;
export const DISPLAY_NAME_MAX_LENGTH = 30;
export const PROFILE_BIO_MAX_LENGTH = 160;

export type DisplayNameValidation =
  | {readonly ok: true; readonly value: string}
  | {readonly ok: false; readonly reason: 'TOO_LONG'};

export const GENERATED_DISPLAY_NAME_BASES = [
  '민트북',
  '달토끼',
  '구름빵',
  '별이',
  '콩이',
  '코코',
  '모카',
  '토리',
  '밤이',
  '초코',
  '누리',
  '다온',
  '하리',
  '소라',
  '가을',
  '봄이',
  '하늘',
  '복숭아',
  '살구',
  '유나',
] as const;

export const normalizeDisplayName = (raw: string): string =>
  raw.normalize('NFKC').trim().replace(/\s+/g, ' ');

export const validateDisplayName = (raw: string): DisplayNameValidation => {
  const value = normalizeDisplayName(raw);
  if (value.length > DISPLAY_NAME_MAX_LENGTH)
    return {ok: false, reason: 'TOO_LONG'};
  return {ok: true, value};
};

/** Deterministic starter name so onboarding never asks the user to type one. */
export function generatedDisplayName(seed: string): string {
  let hash = 2_166_136_261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  const unsigned = hash >>> 0;
  const base =
    GENERATED_DISPLAY_NAME_BASES[
      unsigned % GENERATED_DISPLAY_NAME_BASES.length
    ]!;
  return `${base}${String((unsigned % 90) + 10)}`;
}
