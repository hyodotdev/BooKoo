# 12 — kstyled 0.4.1: complete authoring reference for BooKoo

Source of truth: `/Users/hyo/Github/crossplatformkorea/kstyled` (branch `main`, HEAD `36c2ef6 fix(runtime): normalize dynamic box shorthands`).
Monorepo, pnpm workspaces, `packages/*`:

| path | npm name | version |
|---|---|---|
| `packages/kstyled` | `kstyled` | **0.4.1** |
| `packages/babel-plugin-kstyled` | `babel-plugin-kstyled` | **0.4.1** |
| `packages/docs` | `kstyled-docs` (private, Docusaurus) | — |
| `packages/example` | `example` (private, Expo 54 app) | — |

Docs site: https://crossplatformkorea.github.io/kstyled
Installed and verified against the real npm artifacts in `/Users/hyo/Github/hyodotdev/FightingHows/node_modules/{kstyled,babel-plugin-kstyled}` (both `0.4.1`).

**Everything in §5 (compile rules) and §6 (gotchas) was verified by actually running `babel-plugin-kstyled@0.4.1` over probe sources** — not read off the docs. Several documented patterns are broken; they are called out explicitly.

---

## 0. TL;DR — the rules BooKoo must follow

1. **Install both packages at the identical version.** `kstyled@0.4.1` (dep) + `babel-plugin-kstyled@0.4.1` (devDep). Mismatched versions are an explicitly documented failure mode.
2. **babel.config.js plugin order**: `['babel-plugin-kstyled', {strict: true}]` **first**, `'react-native-worklets/plugin'` (Reanimated 4 / Expo 57) **last**. See §4.
3. **Always `import {styled, css} from 'kstyled'` literally.** The plugin matches on the import *source string* `'kstyled'`. A barrel re-export (`src/styled.ts`) silently disables compilation → runtime CSS parsing. Namespace imports (`import * as k`) also silently fail.
4. **Any `${...}` in a template makes that one declaration runtime-computed** — even `${MODULE_CONST}`. It also flips the whole component onto the dynamic render path (subscribes to theme context, allocates 3–4 objects per render). Keep invariant declarations literal.
5. **`css` with only literal declarations is the single cheapest primitive in the library** — it compiles to a module-hoisted `StyleSheet.create` reference with *zero* per-render cost and *no extra component in the tree*. Prefer it over `styled.View` for hot list rows.
6. **Dark mode forces the dynamic path.** Every theme-colored component is a runtime patch. §8 has the mitigation playbook for infinite ledger lists.
7. **No `@media`, no breakpoints, no nested selectors, no `keyframes`, no `&:hover`, no `createGlobalStyle`, no `withTheme`.** Tablet layout is done in JS: BooKoo's `useTabletLayout()` (window minimum dimension >= 600dp), not `useCPK().media.isTablet` — see `app/AGENTS.md`.
8. **Never put a CSS comment (`/* … */`) inside a kstyled template.** It is silently folded into the next property name and produces a garbage style key. The official kstyled docs show this pattern; the docs are wrong.
9. `strict: true` is **not** a validator. It only rethrows exceptions from the transform, and the transform essentially never throws. Malformed CSS compiles to garbage keys silently. Treat it as cheap insurance, not a safety net.
10. `.attrs()` may appear **at most once** before the template literal. `styled(X).attrs(a).attrs(b)\`…\`` is **not** compiled → silent runtime fallback.

---

## 1. Package surface

### 1.1 Runtime — `kstyled@0.4.1`

`/Users/hyo/Github/crossplatformkorea/kstyled/packages/kstyled/src/index.ts`, verbatim:

```ts
export { styled, __injectKStyledMetadata } from './styled';
export { css } from './css';
export { ThemeProvider, useTheme, defaultTheme, defineTheme } from './theme';
export type { ThemeProviderProps } from './theme';
export type {
  CompiledStyle, DefaultTheme, StyledComponent, StyledComponentProps,
  CompiledStyles, RNStyle, StyleObject, TransientProps, ForwardedProps,
  AsProp, Interpolation, VariantConfig, VariantsConfig, AttrsFunction,
  StyledFunction, StyledFactory,
} from './types';
export type { CssResult } from './css';
```

That is the *entire* public API. Note what is **absent**: `keyframes`, `createGlobalStyle`, `withTheme`, `ThemeConsumer`, `ServerStyleSheet`, `isStyledComponent`, `useIsDark`, any media/breakpoint helper. `VariantConfig` / `VariantsConfig` are exported types with **no implementation** — there is no `variants` API; they are vestigial.

`__injectKStyledMetadata` is deprecated (logs a warning, returns the component unchanged). Never use it.

package.json facts (`packages/kstyled/package.json`):

```json
"type": "commonjs",
"main": "dist/index.js", "module": "dist/index.mjs", "types": "dist/index.d.ts",
"exports": { ".": {
  "react-native": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
  "import":       { "types": "./dist/index.d.mts", "default": "./dist/index.mjs" },
  "require":      { "types": "./dist/index.d.ts",  "default": "./dist/index.js" },
  "default": "./dist/index.js" } },
"sideEffects": false,
"peerDependencies": { "react": ">=17.0.0", "react-native": ">=0.64.0" },
"engines": { "node": ">=18.0.0" }
```

Zero runtime dependencies. Built with `tsup … --format cjs,esm --dts --minify --sourcemap`.

### 1.2 Compiler — `babel-plugin-kstyled@0.4.1`

`"type": "commonjs"`, CJS-only export map, deps: `@babel/helper-module-imports ^7.25.9`, `@babel/template ^7.25.9`, `@babel/types ^7.26.3`.

Source files that matter:
- `src/index.ts` (925 lines) — the plugin. Visitors: `Program.enter`, `ImportDeclaration`, `TaggedTemplateExpression`.
- `src/css-parser.ts` (666 lines) — `parseCSS`, `parseCSSValue`, `cssToRNProperty`, `expandShorthand`, `parseTransformValue`, `parseOffsetValue`, `isValidRNProperty`.
- `src/types.ts` — `PluginOptions`.
- `src/transform.ts` (199 lines) — **DEAD CODE**. Not imported by `index.ts`. Ignore it; it contains an older string-based codegen and would mislead.

---

## 2. `styled` — full API

### 2.1 Two call forms

```tsx
import {styled} from 'kstyled';
import {Pressable} from 'react-native';

// (a) wrap any component
const Button = styled(Pressable)`…`;

// (b) shortcut for a built-in RN component
const Row = styled.View`…`;
```

**Available shortcuts** (exactly these 15, from `packages/kstyled/src/styled.tsx`; each is a lazy `Object.defineProperty` getter so `FlatList`/`SectionList` are not eagerly imported):

`View`, `Text`, `Image`, `ImageBackground`, `ActivityIndicator`, `KeyboardAvoidingView`, `ScrollView`, `Switch`, `TouchableHighlight`, `TouchableOpacity`, `Pressable`, `TextInput`, `SafeAreaView`, `FlatList`, `SectionList`.

`ActivityIndicator`, `KeyboardAvoidingView`, `Switch`, `TouchableHighlight` were **added in 0.4.0**.

There is **no** `styled.FlashList`. For `@shopify/flash-list` use `styled(FlashList)` — or better, don't style it at all and pass `contentContainerStyle` directly (§8).

### 2.2 Typing generics — transient props

```tsx
const Chip = styled(Pressable)<{$active?: boolean; $tone?: 'ok' | 'warn'}>`
  min-height: 32px;
  background-color: ${(p) => (p.$active ? p.theme.role.primary : p.theme.bg.paper)};
`;

// shortcut form takes the generic the same way
const Label = styled.Text<{$muted?: boolean}>`
  color: ${(p) => (p.$muted ? p.theme.text.disabled : p.theme.text.basic)};
`;
```

The generic slot is on the **template call**, not on `styled(...)`. Real signature (`packages/kstyled/src/types/styled-types.ts`, `interface StyledFactory<C, P, AttrsP>`):

```ts
<NewP = {}>(
  strings: TemplateStringsArray,
  ...interpolations: Array<Interpolation<NewP & {theme: DefaultTheme}> | string | number>
): StyledComponent<C, NewP, AttrsP>;
```

`Interpolation<P>` itself is `(props: P & {theme: DefaultTheme}) => StyleObject | string | number | undefined`, so `p.theme` is always typed even when you don't declare it.

Resulting component props (`StyledComponentProps` in `packages/kstyled/src/types/index.ts`):

```ts
type StyledComponentProps<C, P = {}, AttrsP = {}> =
  Omit<ComponentProps<C>, keyof P | keyof AttrsP> & P & Partial<AttrsP> & AsProp;
```

i.e. all the wrapped component's props + your `$`-props + `.attrs()` props made optional + `as?: ComponentType<any>`.

### 2.3 Transient props — the `$` convention

Filtering lives in `packages/kstyled/src/utils/props-filter.ts`:

```ts
const FILTERED_PROPS = new Set(['as', 'theme']);
export function shouldFilterProp(key: string): boolean {
  return key[0] === '$' || FILTERED_PROPS.has(key);
}
```

So exactly three things never reach the native view: any prop whose **first character** is `$`, plus `as` and `theme`. Everything else is forwarded. There is **no** `shouldForwardProp` escape hatch.

Consequence: a non-`$` prop used only for styling (e.g. `variant`) *will* be forwarded to the native view and produce an RN warning. Always prefix with `$`.

### 2.4 `.attrs()`

Two places it can be attached:

```tsx
// (a) on the factory, before the template  ← COMPILED (one level only)
const Input = styled.TextInput.attrs({
  autoCapitalize: 'none',
  placeholderTextColor: '#999',
})`
  font-size: 14px;
`;

// (b) on the finished component, after the template ← runtime, always works, chainable
const EmailInput = Input.attrs({keyboardType: 'email-address'});
```

`.attrs()` accepts a static object **or** a function `(props & {theme}) => Partial<props>`:

```tsx
const Scroll = styled.ScrollView.attrs((p) => ({
  contentContainerStyle: {paddingBottom: p.$bottom ?? 24},
}))`
  flex: 1;
`;
```

Compiles to `attrs: p => ({contentContainerStyle: {padding: p.$pad}})` in the metadata — the function receives the merged props **including `theme`**, so `.attrs()` is a legitimate way to compute themed non-style props (`placeholderTextColor`, `tintColor`, `trackColor`…).

Merge order (`combineAttrs` + `mergeAttrsWithProps` in `props-filter.ts`): base attrs → child attrs → **caller props win over all attrs**. When both are plain objects they are merged once at creation; if either is a function, a combined function is created that evaluates base first and passes its result into the child.

`.attrs()` can even override the render target: returning `{as: SomeComponent}` from an attrs function swaps the component (verified test: *"should allow attrs to override base component via as"*). An explicit `as` prop on the call site beats the attrs one.

**⚠ Compile gotcha**: only `styled(X).attrs(a)\`…\`` (Case 2) and `styled.X.attrs(a)\`…\`` (Case 3) are recognised. **`styled(X).attrs(a).attrs(b)\`…\`` is NOT matched** and falls through to the runtime CSS parser (one `console.warn`, styles still work, but parsed at runtime). Verified. Use form (b) above to chain.

### 2.5 The `as` prop

```tsx
interface AsProp<C extends ComponentType<any> = ComponentType<any>> { as?: C }
```

- `as` takes a **component**, never a string tag.
- It is filtered out of forwarded props.
- It does **not** change the prop types (no polymorphic typing like styled-components v5+). `<Button as={Link} href="…" />` will not typecheck `href`.
- Precedence in `renderDynamic`: explicit `as` prop → `attrs.as` → the collapsed target component.

### 2.6 Style composition / extension

```tsx
const Card = styled.View`
  padding: 16px;
  border-radius: 12px;
`;

const HighlightCard = styled(Card)<{$on?: boolean}>`
  border-width: 1px;
  border-color: ${(p) => (p.$on ? p.theme.role.primary : p.theme.role.border)};
`;
```

Mechanics (`packages/kstyled/src/utils/component-metadata.ts`):

- Every styled component carries `__kstyled_metadata__ = {compiledStyles, styleKeys, getDynamicPatch, attrs, target}`.
- `extractBaseMetadata()` walks up to 5 levels through `forwardRef` / `React.memo` wrappers to find it.
- `mergeMetadata()` concatenates style keys parent-first; **colliding keys are renamed** `base` → `base__1` → `base__2` so parent and child static styles both survive (0.4.0 fix).
- `target` collapses nested wrappers: `styled(styled(styled(View)))` renders **one** `View`, not three nested styled components.
- Dynamic patches compose too (`createCombinedDynamicPatch`): child patch keys override parent's.

Final style precedence, lowest → highest (`buildStyleArray` in `utils/style-merger.ts`):
1. parent compiled static styles
2. child compiled static styles
3. merged dynamic patch
4. `attrs.style` (if attrs supplies one)
5. the caller's `style` prop

External styles get `expandShorthandProperties()` applied (`padding` → 4 longhands, `paddingHorizontal` → left+right, etc.) so an inline `style={{padding: 4}}` actually beats a compiled `paddingTop`.

### 2.7 Refs and display names

Both render paths are `React.forwardRef`, so `ref` reaches the underlying native component. `displayName` is `` `Styled(${BaseComponent.displayName || BaseComponent.name || 'Component'})` ``.

### 2.8 Animated components

`styled(Animated.View)` is special-cased by the plugin: the member expression `Animated.<Name>` is rewritten to `Animated.createAnimatedComponent(<Name imported from react-native>)`.

Verified output:

```js
const A = /*#__PURE__*/styled(Animated.createAnimatedComponent(_View)).__withStyles({…});
```

For **Reanimated** (`react-native-reanimated`'s `Animated.View`), the same member-expression heuristic fires because it keys purely on the identifier name `Animated` — so `import Animated from 'react-native-reanimated'; styled(Animated.View)` will be rewritten to `Animated.createAnimatedComponent(View)` where `View` is freshly imported from `react-native`. That happens to be correct for Reanimated too (it exposes `createAnimatedComponent`), but it is name-based magic: **if you alias the import (`import Reanimated from …`) the rewrite does not fire**. Prefer `styled(Animated.createAnimatedComponent(View))` written explicitly, or just don't style animated components with kstyled — use `useAnimatedStyle` and pass `style={[compiledStatic, animatedStyle]}`.

Also note `isAnimatedComponent()` in `component-metadata.ts` = `Object.isFrozen(component)`; `attachMetadata` swallows the failure to write metadata onto frozen components (logs `[kstyled] Could not set metadata on component:`). Extending a styled *animated* component may therefore lose inheritance.

---

## 3. `css` — inline styles

```tsx
import {css} from 'kstyled';

<View style={css`
  flex-direction: row;
  align-items: center;
  gap: 8px;
`} />
```

### 3.1 What it compiles to (verified)

Static-only → a module-hoisted registered style, referenced directly:

```js
const __ks4 = /*#__PURE__*/_StyleSheet.create({ base: { flexDirection: "row", gap: 8 } });
…
<View style={__ks4.base} />
```

Mixed static + dynamic → a 2-element array:

```js
<View style={[__ks4.base, {
  maxWidth: css.__normalizeStyleValue("maxWidth", wide ? '760px' : '100%'),
  backgroundColor: css.__normalizeStyleValue("backgroundColor", color)
}]} />
```

Dynamic-only → a bare object literal. Dynamic `padding`/`margin` → an object spread:

```js
<View style={{ ...css.__normalizeStyleDeclaration("padding", c ? '6px 12px' : '8px 15px') }} />
```

`css.__normalizeStyleValue` / `css.__normalizeStyleDeclaration` are `@internal` members on the `css` function object, referenced by the compiled code — which is why **the `css` import must stay in scope even when it looks unused**.

### 3.2 Facts that contradict the docs

- The docs claim `css` "processes CSS at **runtime**" (`docs/api.md`) and that it is "**automatically memoized**" (`docs/guides/css-inline.md`). Both are wrong for the compiled path. The memoisation lives in `css.__withStyles` (`packages/kstyled/src/css.tsx`, `_cachedDynamic` hash cache) — and **the 0.4.1 plugin never emits `css.__withStyles`**. The plugin's own test asserts `expect(output).not.toContain('css.__withStyles')`. So a dynamic `css` template allocates a fresh object (and array) on **every render**. There is no identity stability; wrap in `useMemo` yourself if a child depends on style identity.
- `css` works at module scope, inside a function, inside JSX, inside a `style={[…]}` array, and inside a `Pressable`'s `style={({pressed}) => […]}` callback. All are compiled.

### 3.3 ⚠ Never use `p => p.theme` inside `css`

Verified compile output for `css\`background-color: ${(p) => p.theme.bg.basic};\``:

```js
<View style={{
  backgroundColor: css.__normalizeStyleValue("backgroundColor", (p => p.theme.bg.basic)({}))
}} />
```

The arrow is invoked with a literal `{}` — `p.theme` is `undefined` → **TypeError at render**, uncaught (the try/catch that swallows this lives in `css.__withStyles`, which is never emitted).

Correct pattern (this is what FightingHows and cpk-ui actually do):

```tsx
const {theme} = useCPK();          // or useTheme() from kstyled
<View style={css`background-color: ${theme.bg.card};`} />
```

---

## 4. Babel plugin: options and ordering

### 4.1 Options (`packages/babel-plugin-kstyled/src/types.ts`)

| option | default | meaning |
|---|---|---|
| `strict` | `false` | Rethrow transform exceptions as a Babel code-frame error instead of `console.error` |
| `debug` | `false` | Verbose compiler logging to stdout **and** injects `debug: true` into the emitted metadata |
| `importName` | `'kstyled'` | The module specifier the plugin matches on. Change only if you re-export `styled`/`css` from your own module |
| `autoHoist` | — | **deprecated**, accepted and ignored |
| `platformStyles` | — | **deprecated**, accepted and ignored |
| `optimizeStatic` | — | **deprecated**, accepted and ignored |

`strict` implementation (`reportTransformError`, index.ts):

```ts
if (state.opts.strict) { throw path.buildCodeFrameError(message); }
console.error(message);
```

The try/catch only wraps `parseCSS` + AST generation. `parseCSS` splits on `;`/`:` and never throws for malformed input — it just produces nonsense keys. **`strict` will not catch a typo'd property, a media query, a comment, or a dropped interpolation.** Keep it on anyway (it's free), but rely on §6 discipline + code review.

### 4.2 Required babel.config.js for BooKoo

Exactly what Martie (`/Users/hyo/Github/hyodotdev/Martie/babel.config.js`) and FightingHows (`/Users/hyo/Github/hyodotdev/FightingHows/babel.config.js`) ship on Expo 57 / RN 0.86 / Reanimated 4:

```js
module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['babel-plugin-kstyled', {debug: false, strict: true}],
      // Reanimated v4 moved its Babel plugin into react-native-worklets.
      // Must stay last.
      'react-native-worklets/plugin',
    ],
  };
};
```

On Reanimated ≤3 the last entry is `'react-native-reanimated/plugin'` instead (that's what cpk-ui's own repo uses).

### 4.3 Ordering rules and what breaks

1. **kstyled goes in `plugins`, never in `presets`.** Babel runs *all plugins before all presets* on each node. As a plugin, kstyled sees the original `TaggedTemplateExpression` before `babel-preset-expo` touches JSX/TS/template-literals. If it were a preset it would run after other presets and could see already-lowered template literals (`babel-preset-expo` includes `@babel/plugin-transform-template-literals` for low-target builds, e.g. RN Web with older browserslist) — the tag would then be a `_taggedTemplateLiteral(...)` call and **nothing would compile**; every template silently falls back to the runtime parser.

2. **kstyled BEFORE `react-native-worklets/plugin` / `react-native-reanimated/plugin`.** Both Reanimated plugins document a hard "must be listed last" requirement, and kstyled's own README/release notes say *"Configure the compiler before plugins that must run last, such as Reanimated"* / *"Put the kstyled Babel plugin before Reanimated or other last-run plugins."* Concrete failure mode if you invert them: the worklets plugin's `Program` visitor runs first and rewrites function bodies into worklet closures; a `styled(...)`/`css` template that ends up inside a rewritten worklet body is no longer in the shape kstyled's visitor matches, and kstyled's own rewrite (replacing a tagged template with a `__withStyles(...)` call and hoisting a `StyleSheet.create` to module scope) happens after the worklet boundary has been drawn — a module-scope hoist referenced from inside a worklet is not captured. Symptoms range from "styles silently fall back to runtime parsing" to Reanimated's own `Cannot find variable: __ks0` / "Reanimated plugin must be last" build errors.

3. **After any babel.config.js change, clear the Metro cache**: `bunx expo start -c` (or `npx expo start --clear`). Metro caches transform results per-file and will happily keep serving un-compiled modules.

4. `jest-expo` reads the same `babel.config.js`, so tests get compiled styles for free — no extra jest transform config needed.

### 4.4 What the plugin matches (and therefore what silently fails)

`ImportDeclaration` visitor records the **local** names bound to the *named* exports `styled` and `css` from source `opts.importName` (default `'kstyled'`).

| written as | compiled? |
|---|---|
| `import {styled, css} from 'kstyled'` | ✅ |
| `import {styled as s} from 'kstyled'` → `s.View\`…\`` | ✅ (local alias tracked) |
| `import * as k from 'kstyled'` → `k.styled.View\`…\`` | ❌ **silent runtime fallback** |
| `import {styled} from '../styled'` (barrel re-export) | ❌ **silent runtime fallback** (unless `importName: '../styled'`) |
| `require('kstyled')` | ❌ |

Tagged-template shapes recognised (`TaggedTemplateExpression` visitor):

| # | shape | note |
|---|---|---|
| 1 | ``styled(Component)`…` `` | any expression argument, incl. `Typography.Body2` member expressions |
| 2 | ``styled(Component).attrs(x)`…` `` | one `.attrs` only |
| 3 | ``styled.View.attrs(x)`…` `` | one `.attrs` only; auto-imports `View` from `react-native` |
| 4 | ``styled.View`…` `` | auto-imports the RN component |
| 5 | ``styled.View.attrs`…` `` | explicitly detected as invalid, skipped (debug log only) |
| — | ``css`…` `` | handled separately, first |

`state.styleCounter` is per-file, so ids are `__ks0`, `__ks1`, … per module. Each `StyleSheet.create` is spliced in at the index of the first non-import statement (which means later templates appear *above* earlier ones in the output — harmless).

Every emitted `StyleSheet.create(...)` and `styled(X).__withStyles(...)` call carries a leading `/*#__PURE__*/` annotation so bundler DCE can drop unused styled components.

---

## 5. THE PERFORMANCE CONTRACT — what is hoisted vs computed

This is the section that matters for "must stay snappy with unbounded data".

### 5.1 The rule in one line

> A declaration is hoisted into `StyleSheet.create` **iff its value contains no `${}` at all**. One `${}` anywhere in the value moves *that declaration* to runtime **and flips the whole component onto the dynamic render path**.

`packages/babel-plugin-kstyled/src/css-parser.ts` → `isDynamicValue(value)` is literally `value.includes('__EXPR_')`. Nothing smarter. There is **no constant folding**: `${16}`, `${SPACING.md}`, `${theme.colors.x}` — all runtime.

### 5.2 The two render paths (`packages/kstyled/src/styled.tsx`)

```ts
const StyledComponent =
  hasDynamicStyles || hasAttrs
    ? forwardRef(renderDynamic)
    : forwardRef(renderStatic);
```

The branch is fixed at component-creation time (that's the 0.4.0 "stable Hook order" fix).

**`renderStatic`** — no `useContext`, no hooks at all:
- `staticStylesArray` is computed **once** at module load: a single registered style if there's one key, else one array of registered styles. Same reference forever.
- If the caller passes **no** `style` prop, no transient props, no `as`, no `theme` → the render is `<Component {...props} ref={ref} style={staticStylesArray} />`. **Zero allocations.**
- If any of those are present → one `filterProps` object allocation, plus `buildStyleArray` allocates a fresh array and runs `expandShorthandProperties` over the external style.

**`renderDynamic`** — per render:
1. `useThemeOrDefault()` → `useContext(ThemeContext)` (subscribes to theme changes)
2. `{as, style, ...restProps}` rest-spread → alloc #1
3. `{...restProps, theme}` → alloc #2
4. `mergeAttrsWithProps` → alloc #3 (only if attrs)
5. `getDynamicPatch(props)` → alloc #4 (the patch object)
6. `normalizeStyleObject` (unit stripping, `fontWeight` → string, transform-array walk) + `expandShorthandProperties` → alloc #5 only when something actually changes
7. `buildStyleArray` → alloc #6 (the style array)
8. `filterProps` → alloc #7

So roughly **4–7 object allocations per dynamic styled component per render**, plus a context subscription. With 20 visible ledger rows × 8 themed nodes each, that is ~160 subscribed components re-rendering whenever the theme object identity changes.

### 5.3 DO / DON'T

**DO — fully static, hoisted, zero cost**

```tsx
// ✅ compiles to: const __ks0 = StyleSheet.create({base:{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:16,paddingVertical:12}})
const Row = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
`;
```

**DO — cheapest of all for hot rows: static `css`, no wrapper component**

```tsx
// ✅ <View style={__ks0.base} /> — no extra component, no forwardRef, no props copy
<View style={css`flex-direction: row; align-items: center; gap: 8px;`}>
```

**DON'T — a constant interpolation destroys hoisting**

```tsx
const SPACE = {md: 12};

// ❌ compiles to getDynamicPatch: p => ({ padding: SPACE.md }) — runtime, every render,
//    and the component now subscribes to theme context for no reason
const Bad = styled.View`padding: ${SPACE.md}px;`;

// ✅ write the literal
const Good = styled.View`padding: 12px;`;
```

**DON'T — one theme color dragging an otherwise-static component onto the dynamic path is unavoidable, but keep the patch to ONE key**

```tsx
// ❌ 4 dynamic keys → 4 closure calls + a 4-key object every render
const Bad = styled.View`
  padding: ${(p) => p.theme.space.md}px;
  border-radius: ${(p) => p.theme.radii.md}px;
  border-width: ${(p) => (p.$on ? 2 : 1)}px;
  background-color: ${(p) => p.theme.bg.card};
`;

// ✅ literals for everything that doesn't actually change with theme/props
const Good = styled.View`
  padding: 12px;
  border-radius: 8px;
  border-width: 1px;
  background-color: ${(p) => p.theme.bg.card};
`;
```

**DON'T — define styled components inside a component body**

```tsx
function Screen() {
  const Card = styled.View`padding: 16px;`;   // ❌ new component type every render → full remount of the subtree
  return <Card />;
}
```
(The `StyleSheet.create` *is* still hoisted to module scope — but `styled(View).__withStyles({…})` re-runs, producing a brand-new component identity each render.)

**DON'T — recreate an inline `style` object for a static styled component**

```tsx
<Row style={{marginTop: 8}} />   // ❌ forces buildStyleArray + expandShorthandProperties every render
```
Hoist it: `const MT8 = {marginTop: 8};` or fold it into the template.

**DO — put per-item variation in ONE transient prop, not in the style prop**

```tsx
const Amount = styled.Text<{$negative?: boolean}>`
  font-size: 15px;
  font-weight: 700;
  color: ${(p) => (p.$negative ? p.theme.text.danger : p.theme.text.basic)};
`;
```

### 5.4 What `parseCSS` does to *static* values (all at build time)

- kebab-case → camelCase via a 130-entry `CSS_TO_RN_MAP`, with a generic `-([a-z])` → uppercase fallback. Unknown properties are silently camelCased and emitted (`foo-bar: 3px` → `fooBar: 3`).
- camelCase input is accepted verbatim (`backgroundColor: #fff` works).
- `16px` / `1.5em` / `0.5rem` / `-10px` / `16` → number. `50%` → the string `'50%'`.
- `font-weight: 700` → the string `'700'` (RN requires string weights).
- `padding: 12px 16px` (2/3/4 values) → **expanded to `paddingTop/Right/Bottom/Left`** longhands (deliberate: longhand beats shorthand in RN's style resolution). A **single-value** `padding: 16px` stays as `padding: 16`.
- `shadow-offset: 0px 2px` → `{width: 0, height: 2}`.
- `transform: rotate(45deg) scale(1.2)` → `[{rotate:'45deg'},{scale:1.2}]`. Supported functions: `translate`, `translateX/Y`, `scale`, `scaleX/Y`, `rotate`, `rotateX/Y/Z`, `skewX/Y`, `perspective`, `matrix` (9 or 16 args). Anything else → the whole declaration falls back to a raw string.
- Trailing `;` on the last declaration is optional.
- New-arch props pass through fine: `box-shadow`, `filter`, `outline-*`, `border-curve`, `box-sizing`, `gap`/`row-gap`/`column-gap`, logical `*-start`/`*-end`/`*-block-*`.

### 5.5 What the runtime does to *dynamic* values

`packages/kstyled/src/css-runtime-parser.ts` + `utils/style-merger.ts`, applied inside `mergeDynamicPatches` for `styled`, and inline via `css.__normalizeStyleValue` for `css`:

- `'16px'`/`'1.5em'`/`'-10px'` → number; `'50%'` stays a string; quoted `'"red"'` → `red`.
- `fontWeight` numeric → string.
- `transform` arrays and `shadowOffset` objects are walked recursively and normalised.
- `padding`/`margin` whose value is a **multi-token string** (`'12px 24px'`) is expanded to longhands — this is the entire content of the 0.4.1 patch. Single values are expanded to all four sides.
- `paddingHorizontal`/`paddingVertical`/`marginHorizontal`/`marginVertical` in an *external* style are expanded to left/right / top/bottom so they can override compiled longhands.

---

## 6. GOTCHAS — verified failure modes (all silent)

Each of these was reproduced by running the real plugin. None throws, none warns, none is caught by `strict: true`.

### 6.1 ❌ CSS comments corrupt the next property

```tsx
const A = styled.View`
  /* layout */
  flex: 1;
`;
```
compiles to
```js
StyleSheet.create({ base: { "/* layout */\n  flex": 1 } })
```
The declaration is lost. **`docs/guides/styling.md` explicitly shows `/* iOS */` / `/* Android */` comments in templates — that documentation is wrong.** Put comments in `//` JS comments *outside* the template, or above the `const`.

### 6.2 ❌ Block / conditional interpolations are silently dropped

```tsx
const A = styled.View`
  flex: 1;
  ${Platform.OS === 'ios' && `shadow-opacity: 0.1;`}
`;
// → StyleSheet.create({base:{flex:1}})  — the whole block vanished
```
Same for `${cond ? 'opacity: 0.5;' : ''}` and for nesting a `css` template inside a `styled` template (`` styled.View`${css`flex:1;`}` `` → `__withStyles({})`).
**`docs/troubleshooting.md` recommends exactly this Platform pattern — it does not work.** Use `Platform.select` on a value, or two styled components, or `${(p) => Platform.OS === 'ios' ? 0.1 : 0}` on a single declaration.

### 6.3 ❌ `transform: ${fn}` returning an array is dropped

```tsx
const A = styled.View`transform: ${(p) => [{translateX: p.$x}]};`;
// → __withStyles({})   ← the transform never renders
```
Also dropped: `transform: ${(p) => \`rotate(${p.$d}deg)\`}`.
**`docs/guides/dynamic-props.md` §"Transform arrays" documents the array form — it only works in the un-compiled runtime fallback.**

✅ The only compile-safe dynamic transform is the function syntax:
```tsx
const A = styled.View`transform: translateX(${(p) => p.$x}px) scale(${(p) => p.$s});`;
// → transform: [{translateX: …}, {scale: …}]
const B = styled.View`transform: rotate(${(p) => p.$d}deg);`;
// → transform: [{rotate: `${…}deg`}]
```

### 6.4 ❌ Dynamic `%` loses its unit

```tsx
const Fill = styled.View`width: ${(p) => p.$pct}%;`;
// → width: (p => p.$pct)(p)     ← the '%' is stripped from the placeholder → becomes a dp number
```
✅ Return the string from inside the expression:
```tsx
const Fill = styled.View`width: ${(p) => `${p.$pct}%`};`;
```
(The example app does this correctly: ``width: ${(p) => p.$signal === 'healthy' ? '34%' : '94%'};``.)

### 6.5 ❌ Multi-token dynamic values (other than padding/margin) become strings

```tsx
const A = styled.View`shadow-offset: ${(p) => p.$x}px ${(p) => p.$y}px;`;
// → shadowOffset: `${…}px ${…}`   ← a string, and the 2nd 'px' is eaten. Invalid for Fabric.

const B = styled.View`border: ${1}px solid ${'#000'};`;
// → border: "1px solid #000"      ← not an RN property at all
```
Only `padding` and `margin` get shorthand expansion. Write longhands, or pass a style object.

### 6.6 ❌ `@media`, nested selectors, pseudo-classes produce garbage keys

```tsx
`@media (min-width: 768px) { padding: 32px; }` → { "@media (minWidth": "768px) { padding: 32px" }
`&:hover { opacity: 0.5; }`                    → { "&": "hover { opacity: 0.5" }
```
There is no selector/at-rule support of any kind. See §9 for the real approach.

### 6.7 ❌ `p => p.theme` inside `css` throws at render — see §3.3.

### 6.8 ❌ Chained `.attrs()` before the template → runtime fallback (§2.4).

### 6.9 ❌ Barrel / namespace imports → runtime fallback (§4.4).

### 6.10 ⚠ Runtime-fallback warnings

If any of the above silently de-compiles, you get **exactly one** warning per process, from `packages/kstyled/src/styled.tsx`:

```
[kstyled] Runtime parsing is active. Add babel-plugin-kstyled to compile styles at build time.
```
and for `css`:
```
[kstyled] css`` is using the runtime fallback. Add babel-plugin-kstyled to compile inline styles.
```
**Make these fatal in dev.** Suggested guard in `app/_layout.tsx` (dev only): monkey-patch `console.warn` to `throw` on a message starting with `[kstyled]`. This is the only reliable detector, since `strict` doesn't catch de-compilation.

### 6.11 ⚠ The runtime fallback parser is weaker than the compiler

`css-runtime-parser.ts` has a 40-entry property map (vs 130), does **not** parse `transform`/`shadow-offset` into objects, and does not handle `font-variant` etc. So a de-compiled template can render *differently*, not just slower.

### 6.12 ⚠ `useTheme()` throws outside a provider

```ts
if (!context) throw new Error('useTheme must be used within a ThemeProvider');
```
`styled` components themselves use `useThemeOrDefault()` which falls back to `defaultTheme` (`{colors:{},space:{},radii:{},fontSizes:{},fonts:{}}`) — so a themed styled component **outside** a provider renders with `undefined` colors rather than crashing. Silent wrong colors. Make sure the provider is above everything, including error boundaries and splash screens.

---

## 7. Theming

### 7.1 The API

```ts
function defineTheme<TTheme extends DefaultTheme>(theme: TTheme): TTheme  // identity fn, preserves literal types
function ThemeProvider<TTheme extends DefaultTheme>(props: {theme: TTheme; children: ReactNode}): JSX.Element
function useTheme<TTheme extends DefaultTheme = DefaultTheme>(): TTheme   // throws outside provider
const defaultTheme: DefaultTheme
```

`ThemeProvider` does `useMemo(() => ({theme}), [theme])` — **the context value changes whenever the theme object identity changes**. Pass a stable/memoised object.

### 7.2 `DefaultTheme` and declaration merging

```ts
export interface DefaultTheme {
  colors: Record<string, string>;   // ← REQUIRED, even after augmentation
  space?: Record<string, number>;
  radii?: Record<string, number>;
  fontSizes?: Record<string, number>;
  fonts?: Record<string, string>;
  [key: string]: unknown;
}
```

Because of the index signature, an un-augmented `p.theme.anything` is `unknown` — you must augment to get real autocomplete.

**BooKoo should copy Martie/FightingHows verbatim.** `/Users/hyo/Github/hyodotdev/Martie/src/styled.d.ts`:

```ts
import 'kstyled';
import type {CustomAppTheme} from './theme';
import {CpkTheme} from 'cpk-ui/utils/theme';

type AllTheme = CustomAppTheme & CpkTheme;

declare module 'kstyled' {
  export interface DefaultTheme extends AllTheme {}
}

declare module 'cpk-ui' {
  export interface CpkTheme extends AllTheme {}
}
```

Two augmentations, because cpk-ui's own `CpkTheme` interface is also open for merging (`/Users/hyo/Github/crossplatformkorea/cpk-ui/src/utils/theme.ts` declares `export interface CpkTheme extends CpkThemeBase {}` precisely for this). `import 'kstyled';` at the top is required to make the file a module.

⚠ Merging does **not** remove the required `colors: Record<string,string>` member. If you ever construct a theme object yourself and hand it to `ThemeProvider` you'll need `as DefaultTheme` (that is exactly what cpk-ui does). With `CpkProvider` you never touch it.

`src/theme.ts` shape (Martie):

```ts
import {CpkThemeParams} from 'cpk-ui/utils/theme';

export type CustomAppTheme = CpkThemeParams & {
  role: {…}; bg: {…}; text: {…};
};
export const light: CustomAppTheme = {role: {…}, bg: {…}, text: {…}, button: {…}};
export const dark:  CustomAppTheme = {…};
export const theme = {light, dark};
```

⚠ **Hard constraint documented in FightingHows' `src/theme.ts`:** every custom token must live inside one of the four groups `bg` / `role` / `text` / `button`. cpk-ui's `genTheme()` builds the runtime theme by spreading exactly those four keys — a new top-level group typechecks but is **dropped at runtime**.

### 7.3 Runtime light/dark switching — two options

**Option A (what BooKoo will use, because it uses cpk-ui): `CpkProvider`.**

`/Users/hyo/Github/crossplatformkorea/cpk-ui/src/providers/ThemeProvider.tsx` already renders kstyled's provider:

```tsx
import {ThemeProvider as KStyledThemeProvider} from 'kstyled';
…
const theme = {...baseTheme, ...media} as DefaultTheme & CpkTheme;
return (
  <CpkProvider value={{media, themeType, changeThemeType, theme}}>
    <KStyledThemeProvider theme={theme}>{children}</KStyledThemeProvider>
  </CpkProvider>
);
```

So in BooKoo (`src/providers.tsx`, copy Martie/FightingHows):

```tsx
<CpkProvider themeConfig={{initialThemeType, customTheme: theme}}>
  …
</CpkProvider>
```

- Follows the OS color scheme via `useDebouncedColorScheme(300)` (a 300 ms debounce that exists to kill the flicker RN's `useColorScheme()` produces when returning from background).
- `initialThemeType` **pins** the theme and disables OS following (see the `useEffect`: if `initialThemeType` is set it always wins).
- Toggle at runtime: `const {changeThemeType} = useCPK(); changeThemeType('dark')` — or `changeThemeType()` with no arg to flip.
- Read it: `const {theme, themeType} = useCPK()`.
- kstyled's own `useTheme()` **also works** under `CpkProvider` and returns the same object. Either is fine; `useCPK()` gives you `themeType` + `media` too.

⚠ **Perf note on this bridge**: `genTheme()` runs twice and builds a brand-new `theme` object on *every* render of cpk-ui's `ThemeProvider`. Since kstyled's `ThemeProvider` memoises on theme identity, every such render invalidates the context → **every dynamic styled component in the tree re-renders**. `ThemeProvider` re-renders on: color-scheme debounce tick, `changeThemeType`, and **any `useMediaQuery` change (i.e. device rotation / window resize)**. Not per-frame, but it means a rotation on tablet re-renders the entire styled tree. Budget for it; don't add more state to that provider.

**Option B (no cpk-ui): kstyled's provider directly.** Pattern from `packages/example/src/theme.tsx`:

```tsx
export const lightTheme = defineTheme<AppTheme>({isDark: false, colors: {…}});
export const darkTheme  = defineTheme<AppTheme>({isDark: true,  colors: {…}});

const theme = mode === 'dark' ? darkTheme : lightTheme;   // stable module-level objects
<ThemeProvider theme={theme}>…</ThemeProvider>
```
Note both theme objects are module constants → stable identity → context value only changes when the mode actually flips. **This is strictly better for perf than cpk-ui's rebuild-on-every-render approach**; if BooKoo ever hits theme-churn problems, memoising cpk-ui's `theme` (or upstreaming a `useMemo` into cpk-ui) is the fix.

### 7.4 Typed theme without global augmentation

```tsx
const theme = defineTheme({colors: {accent: '#087A55'}, space: {md: 12}});
type AppTheme = typeof theme;
export const useAppTheme = () => useTheme<AppTheme>();
```
Useful in a shared package; for the app, global augmentation (§7.2) is simpler and makes `p.theme.*` typed inside templates, which the generic form cannot do.

---

## 8. Keeping infinite ledger lists fast

kstyled-specific playbook, on top of the FlashList + `usePaginatedQuery` rules already in the FightingHows AGENTS.md.

1. **Row internals: static `css` > static `styled` > dynamic `styled`.**
   A fully-static `css` template is `style={__ks0.base}` — one registered style ID, no extra component, no props copy. A static `styled.View` is the same style plus one `forwardRef` component and one render call. A themed `styled` is that plus `useContext` + 4–7 allocations.

2. **Hoist the theme out of the row.** Compute themed style objects once in the list parent and pass them down, or memoise per row:
   ```tsx
   const {theme} = useCPK();
   const rowStyle = useMemo(
     () => ({backgroundColor: theme.bg.card, borderColor: theme.role.hairline}),
     [theme],
   );
   …
   <View style={[STATIC_ROW, rowStyle]} />   // STATIC_ROW = module-level css`…`
   ```
   This collapses N themed components per row into one memoised object.

3. **`React.memo` your row component** and keep its props referentially stable. kstyled does **not** memoise anything; `styled` components re-render whenever the parent does.

4. **Never build a `style` array inline in `renderItem`.** `style={[a, b]}` allocates per render and defeats FlashList's recycling diff. Hoist or memoise.

5. **Avoid dynamic `css` in rows.** It allocates a fresh object every render (§3.2) — the documented "automatic memoization" does not exist in the compiled path.

6. **Prefer one transient prop over several.** `$state` carrying a union beats `$active`+`$pending`+`$error`: fewer closure invocations, smaller patch object.

7. **Don't style the list itself with `styled(FlashList)`.** Pass `contentContainerStyle` / `style` directly from a hoisted `css` template; wrapping FlashList adds a forwardRef layer between it and its recycling internals.

8. **Watch the theme-identity churn** (§7.3). One rotation = a full styled-tree re-render. If ledger screens are heavy, memoise the cpk-ui theme.

9. **Verify compilation in CI.** Add a check that the bundle contains no `[kstyled] Runtime parsing is active` path — or the dev-time `console.warn` → `throw` guard from §6.10. A de-compiled template is both slower *and* semantically different (§6.11).

---

## 9. Responsive / tablet — kstyled has nothing, here's what to do

**kstyled has no media queries, no breakpoints, no `useMediaQuery`, no orientation hook.** Confirmed by grep across `packages/kstyled/src`, `packages/babel-plugin-kstyled/src`, README, CHANGELOG, and all docs pages: zero hits for `@media`, `keyframes`, `breakpoint`.

Three mechanisms exist in this codebase family. Use the third.

### 9.1 cpk-ui's `media` flags (available for free)

`cpk-ui/src/providers/ThemeProvider.tsx` uses `@expo/match-media` + `react-responsive`:

```tsx
import '@expo/match-media';
import {useMediaQuery} from 'react-responsive';

const isPortrait = useMediaQuery({orientation: 'portrait'});
// responsiveDesignMode: 'mobile-first' (default) | 'desktop-first'
const isMobile  = useMediaQuery(mobileFirst ? {minWidth: 0}   : {minWidth: 0, maxWidth: 767});
const isTablet  = useMediaQuery(mobileFirst ? {minWidth: 767} : {minWidth: 768, maxWidth: 992});
const isDesktop = useMediaQuery(mobileFirst ? {minWidth: 992} : {minWidth: 0});
```

Exposed two ways:
- `const {media: {isTablet, isPortrait, isMobile, isDesktop}} = useCPK();`
- **merged into the theme object** (`const theme = {...baseTheme, ...media}`), so `${(p) => (p.theme.isTablet ? 32 : 16)}px` works inside a kstyled template.

⚠ Note the mobile-first breakpoints **overlap**: at ≥992 all three of `isMobile`/`isTablet`/`isDesktop` are true. Check `isDesktop` before `isTablet` before `isMobile`, or use option 9.3.
⚠ Requires `@expo/match-media` as a dependency (FightingHows has `"@expo/match-media": "^0.4.0"`).
⚠ Reading `p.theme.isTablet` in a template pushes that component onto the dynamic path — see §5.2.

### 9.2 `useWindowDimensions()` directly

Martie's `src/modals/FirstQuizModal.tsx` does `const {height: viewportHeight} = useWindowDimensions();` for one-off sizing. Fine for one-offs; don't scatter breakpoint math.

### 9.3 ✅ THE PATTERN TO COPY — a `useLayout()` hook

`/Users/hyo/Github/hyodotdev/FightingHows/src/hooks/useLayout.ts`, verbatim:

```ts
import {useWindowDimensions} from 'react-native';

/** Smallest edge that still feels like a tablet, including iPad mini. */
const TABLET_MIN_EDGE = 600;
/** Width at which a landscape phone should still get tablet columns. */
const TABLET_MIN_WIDTH = 768;

export interface Layout {
  width: number; height: number;
  isTablet: boolean; isLandscape: boolean;
  gutter: number;
  contentMaxWidth: number;   // centered column for settings / forms / detail
  shortsColumnWidth: number;
  gridColumns: number;
}

export function useLayout(): Layout {
  const {width, height} = useWindowDimensions();
  const shortest = Math.min(width, height);
  const isTablet = shortest >= TABLET_MIN_EDGE || width >= TABLET_MIN_WIDTH;
  const isLandscape = width > height;
  const gutter = isTablet ? 32 : 16;
  const contentMaxWidth = isTablet ? Math.min(760, width - gutter * 2) : width;
  const shortsColumnWidth = isTablet ? Math.min(480, Math.round(height * (9 / 16))) : width;
  const gridColumns = width >= 1100 ? 4 : width >= 768 ? 3 : 2;
  return {width, height, isTablet, isLandscape, gutter, contentMaxWidth, shortsColumnWidth, gridColumns};
}
```

Why this beats 9.1: no `@expo/match-media`/`react-responsive` dependency, no overlapping breakpoints, unambiguous booleans, and derived numbers (gutter, max width, column count) live in one place. `useWindowDimensions` is a cheap RN core hook that re-renders only its own consumers — it does **not** invalidate the kstyled theme context the way cpk-ui's media queries do.

Paired container component (`/Users/hyo/Github/hyodotdev/FightingHows/src/uis/ScreenBody.tsx`) — **this is the tablet layout primitive BooKoo needs**:

```tsx
export default function ScreenBody({children, flush = false}: Props): ReactElement {
  const {contentMaxWidth, isTablet} = useLayout();

  if (flush || !isTablet) {
    return <View style={css`flex: 1;`}>{children}</View>;
  }
  return (
    <View style={css`flex: 1; align-items: center;`}>
      <View style={css`flex: 1; width: 100%; max-width: ${contentMaxWidth + 'px'};`}>
        {children}
      </View>
    </View>
  );
}
```

Note the idiom `max-width: ${contentMaxWidth + 'px'};` — the `px` is inside the expression. `${contentMaxWidth}px` would also work (the plugin strips the trailing unit from the placeholder), but keeping it inside is the safer habit given §6.4.

Also seen in FightingHows: branching whole subtrees rather than styles —
`{isTablet ? <TabIndexTablet /> : <TabIndexMobile />}` (`app/(tabs)/index.tsx`) and `isTablet ? … : …` in `src/uis/QuizView/index.tsx` (Martie). For a ledger app, expect: phone = single column list; tablet = master/detail (list + day detail side by side) — that is a component-level branch, not a style branch.

### 9.4 Concrete recipe for BooKoo

- `src/hooks/useLayout.ts` — copy 9.3, tune `contentMaxWidth` for a ledger (a 560–720 px reading column).
- `src/uis/ScreenBody.tsx` — copy verbatim.
- Breakpoint-dependent *sizes* → pass through `css` inline or a `$`-prop, never a second styled component.
- Breakpoint-dependent *structure* → branch the tree.
- Never encode breakpoints in the theme; keep `useLayout()` the single source.

---

## 10. Testing / tooling notes

- `jest-expo` uses the project `babel.config.js`, so templates are compiled in tests; snapshots contain registered style IDs (numbers on native), not style objects. Use `StyleSheet.flatten(...)` in assertions.
- kstyled's own tests mock `react-native` (`packages/kstyled/src/__tests__/setup.ts`) and suppress `[kstyled]` warnings — don't copy that suppression into BooKoo; you want those warnings loud (§6.10).
- `debug: true` prints per-template compiler output to the Metro console, including the reconstructed CSS string, the parsed static keys, and the final dynamic prop list. Invaluable when a declaration mysteriously vanishes.
- The plugin also injects `debug: true` into the metadata object when `debug` is on — harmless, but don't ship it.
- ESLint: nothing kstyled-specific exists. A custom rule banning `/*` inside `styled`/`css` template literals and banning `styled(` inside function bodies would catch §6.1 and the "define at module scope" rule cheaply.

---

## 11. CHANGELOG — what shipped, what is still open

`/Users/hyo/Github/crossplatformkorea/kstyled/CHANGELOG.md`.

**0.4.1 (2026-07-11)** — Fixed only:
- Expand runtime-computed `padding`/`margin` values such as `"12px 24px"` into RN longhands.
- Compile dynamic box shorthands used by function-scoped `css` templates without passing unsupported multi-value strings to Fabric.
- Same normalisation applied to styled dynamic patches, runtime-fallback styles, and externally merged style objects.

**0.4.0 (2026-07-11)** — Added: function-scoped `css` compilation; `strict` mode; `defineTheme` + generic `useTheme`; `ActivityIndicator`/`KeyboardAvoidingView`/`Switch`/`TouchableHighlight` shortcuts; export maps + source maps + npm provenance.
Fixed: stable Hook ordering when an external `style` prop changes; parent dynamic styles preserved when extending; compiled style-key collisions across nested styled components; nested styled wrappers collapsed to the original target; chained factory/component `attrs` preserved; shortcut `attrs` syntax compiled; transform arrays + shadow-offset objects serialised; numeric strings normalised for Fabric.
Performance: single compiled style reference instead of an array wrapper; no cloning of external styles when no shorthand expansion is needed; no cloning of already-normalised dynamic objects; stack-trace collection removed from the normal fallback path.
Compatibility: RN + CJS consumers get the CJS build, ESM gets `.mjs` + matching declarations; `optimizeStatic` / `autoHoist` / `platformStyles` accepted but deprecated no-ops.

**No "Known issues" / "Unreleased" section exists.** There is no public issue tracker snapshot in the repo. The defects in §6 are **not** listed in the changelog — they are live in 0.4.1 and were found empirically here. Upstreamable if BooKoo wants them fixed:
1. CSS comments corrupt the following declaration (§6.1)
2. Block interpolations silently dropped, incl. the pattern the docs recommend (§6.2)
3. `transform: ${fnReturningArray}` silently dropped, contradicting the docs (§6.3)
4. Dynamic `%` unit stripped (§6.4)
5. Chained `.attrs()` before the template not compiled (§6.8)
6. `css.__withStyles` memoisation is dead code — the plugin never emits it, yet the docs advertise automatic memoisation (§3.2)
7. `strict: true` catches essentially nothing (§4.1)
8. `packages/babel-plugin-kstyled/src/transform.ts` is dead code

Upstream repo: https://github.com/crossplatformkorea/kstyled/issues

---

## 12. Version matrix for BooKoo

BooKoo targets **Expo SDK 57**. Both reference apps are already there:

| | Martie | FightingHows | kstyled example | cpk-ui repo |
|---|---|---|---|---|
| expo | ~57.0.9 | ~57.0.9 | ~54.0.35 | 54-era |
| react-native | 0.86.2 | 0.86.2 | 0.81.5 | 0.81.x |
| react | (57 default) | 19.2.3 | 19.1.0 | 19.1.0 |
| kstyled | 0.4.1 | 0.4.1 | workspace | 0.4.1 |
| babel-plugin-kstyled | 0.4.1 | 0.4.1 | workspace | 0.4.1 |
| cpk-ui | 0.7.0 | 0.7.0 | — | — |
| reanimated | — | 4.5.1 | — | 3.x |
| worklets | — | 0.10.1 | — | — |
| babel plugin order | kstyled → `react-native-worklets/plugin` | same | kstyled only | kstyled → `react-native-reanimated/plugin` |

kstyled 0.4.1 is verified in production on Expo 57 / RN 0.86 by two apps. No version-skew risk for kstyled itself (unlike cpk-ui 0.7.0, which was built against Expo 54 — see note 11 in `11-cpk-ui-api.md`).

Install line for BooKoo:

```bash
bun add kstyled@0.4.1
bun add -d babel-plugin-kstyled@0.4.1
```

---

## 13. Copy-paste starting kit for BooKoo

`babel.config.js`
```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['babel-plugin-kstyled', {debug: false, strict: true}],
      // Reanimated 4 moved its Babel plugin into react-native-worklets. Must stay last.
      'react-native-worklets/plugin',
    ],
  };
};
```

`src/styled.d.ts`
```ts
import 'kstyled';
import type {CpkTheme} from 'cpk-ui/utils/theme';
import type {CustomAppTheme} from './theme';

type AllTheme = CustomAppTheme & CpkTheme;

declare module 'kstyled' {
  export interface DefaultTheme extends AllTheme {}
}
declare module 'cpk-ui' {
  export interface CpkTheme extends AllTheme {}
}
```

`src/theme.ts`
```ts
import type {CpkThemeParams} from 'cpk-ui/utils/theme';

// Custom tokens MUST live under bg / role / text / button — cpk-ui's genTheme()
// spreads exactly those four groups; a new top-level group is dropped at runtime.
export type CustomAppTheme = CpkThemeParams & {
  role: {income: string; expense: string; /* … */};
  bg: {card: string; /* … */};
  text: {muted: string; /* … */};
};

export const light: CustomAppTheme = {/* … */};
export const dark: CustomAppTheme = {/* … */};
export const theme = {light, dark};
```

`src/providers.tsx`
```tsx
import {CpkProvider} from 'cpk-ui';
import {theme} from './theme';

export default function RootProvider({children}: {children: ReactElement}) {
  return (
    <CpkProvider themeConfig={{customTheme: theme}}>
      {/* omit initialThemeType so the app follows the OS color scheme */}
      {children}
    </CpkProvider>
  );
}
```

`src/uis/kstyled-guard.ts` (dev only — import once from `app/_layout.tsx`)
```ts
if (__DEV__) {
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string' && first.startsWith('[kstyled]')) {
      throw new Error(`kstyled left the compiled path: ${first}`);
    }
    warn(...args);
  };
}
```

Representative component, following every rule above:
```tsx
import {styled, css} from 'kstyled';
import {Pressable, View} from 'react-native';
import {useCPK} from 'cpk-ui';

// static-only: hoisted, zero per-render cost
const Row = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  min-height: 56px;
`;

// exactly one dynamic declaration
const Amount = styled.Text<{$negative?: boolean}>`
  font-size: 15px;
  font-weight: 700;
  color: ${(p) => (p.$negative ? p.theme.text.danger : p.theme.text.basic)};
`;

// hot list row: static css, no wrapper component
const SEPARATOR = css`height: 1px; margin-left: 16px;`;

export function LedgerRow({entry}: Props) {
  const {theme} = useCPK();
  return (
    <Row>
      <Amount $negative={entry.amount < 0}>{format(entry.amount)}</Amount>
      <View style={[SEPARATOR, {backgroundColor: theme.role.border}]} />
    </Row>
  );
}
```
