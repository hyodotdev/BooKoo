export type WholeWordFit =
  | {readonly numberOfLines: 2}
  | {
      readonly adjustsFontSizeToFit: true;
      readonly minimumFontScale: number;
      readonly numberOfLines: 1;
    };

/**
 * Text props for a short label that may take two lines. A one-word
 * Latin-script label shrinks to stay whole on one line: no width fits every
 * locale's longest word ("Pemeliharaan", "Announcements" at the largest text
 * size), and two lines split it inside the word. Labels with spaces wrap at
 * the spaces, and CJK or Hangul labels keep wrapping where their scripts may.
 */
export function wholeWordFit(label: string): WholeWordFit {
  return /\s/.test(label.trim()) || !/[A-Za-zÀ-ɏ]/.test(label)
    ? {numberOfLines: 2}
    : {adjustsFontSizeToFit: true, minimumFontScale: 0.7, numberOfLines: 1};
}
