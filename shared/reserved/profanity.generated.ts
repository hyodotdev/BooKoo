/**
 * Normalized/confusable keys that may not be used as handles. Kept in a data
 * module so moderation can regenerate the list without changing validation.
 */
export const PROFANITY_KEYS: ReadonlySet<string> = new Set([
  'asshole',
  'bitch',
  'fuck',
  'fuckyou',
  'nigger',
  'sibal',
  'ssibal',
  'sex',
]);
