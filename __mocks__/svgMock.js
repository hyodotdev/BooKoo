/**
 * Stand-in for `*.svg` imports (mapped in `jest.config.ts`).
 *
 * The template shipped a `\.svg` moduleNameMapper entry pointing at this file
 * without ever creating it, so any future `.svg` import blew up at resolve
 * time. Creating it (rather than dropping the mapping) keeps the mapping
 * useful: jest-expo's preset maps no asset extensions of its own, so without
 * this jest would try to parse raw SVG markup as JavaScript.
 */
module.exports = 'SvgMock';
