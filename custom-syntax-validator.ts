/**
 * Message-syntax validator for the `i18n-json/valid-message-syntax` rule
 * configured in `.eslintrc.js`.
 *
 * `eslint-plugin-i18n-json` `require()`s this path at lint time and calls the
 * export once per leaf entry in every non-ignored `assets/langs/*.json` file,
 * passing the translated message and the full dot-joined key path
 * (e.g. `ledger.entry.add_title`).
 *
 * WHAT IT ACTUALLY ENFORCES: **no hyphen anywhere in an i18n key path.**
 * Keys must be `snake_case` or `camelCase`, which keeps every key a valid
 * identifier fragment, keeps `t('a.b_c')` greppable, and keeps the key set
 * fully static — no `t(dynamicKey as any)` anywhere in the app. The message
 * value itself is deliberately NOT inspected (no ICU/placeholder checking);
 * `i18n-json/identical-placeholders` would be the rule for that.
 *
 * Deliberately plain CommonJS despite the `.ts` extension: Node falls back to
 * the `.js` loader for unrecognized extensions, so TypeScript syntax here
 * would be a runtime SyntaxError under `npx eslint`. The `= ''` defaults are
 * what give TypeScript the parameter types under the repo's strict
 * `tsconfig.json` (whose `include` glob picks this file up) without adding any
 * TypeScript-only syntax.
 */
module.exports = (_message = '', key = '') => {
  if (key.includes('-')) {
    throw new SyntaxError('Key must use underscore(_) instead of hyphen(-)!');
  }
};
