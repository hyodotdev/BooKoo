// Conventional Commits, via @commitlint/config-conventional.
//
// Accepted types (config-conventional defaults, unchanged so `gcommit` and the
// release tooling keep working): build, chore, ci, docs, feat, fix, perf,
// refactor, revert, style, test.
//
// The only deviation: `chore(deps)` / `chore(deps-dev)` bodies are exempt from
// the body line-length cap, because dependency bots paste long changelog URLs.
const {maxLineLength} = require('@commitlint/ensure');

const bodyMaxLineLength = 500;

const validateBodyMaxLengthIgnoringDeps = (parsedCommit) => {
  const {type, scope, body} = parsedCommit;

  const isDepsCommit =
    type === 'chore' && (scope === 'deps' || scope === 'deps-dev');

  return [
    isDepsCommit || !body || maxLineLength(body, bodyMaxLineLength),
    `body's lines must not be longer than ${bodyMaxLineLength}`,
  ];
};

module.exports = {
  extends: ['@commitlint/config-conventional'],
  plugins: ['commitlint-plugin-function-rules'],
  rules: {
    'body-max-line-length': [0],
    'function-rules/body-max-line-length': [
      2,
      'always',
      validateBodyMaxLengthIgnoringDeps,
    ],
  },
};
