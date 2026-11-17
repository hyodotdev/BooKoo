# 11 — cpk-ui API surface + how to contribute a `<Calendar>` component

Source of truth: `/Users/hyo/Github/crossplatformkorea/cpk-ui` (git branch `main`, HEAD `73c619a docs(contributing): standardize bun workflow`).
Published as npm **`cpk-ui`**, version **0.7.0** (version lives in `lib/package.json`, NOT in the repo root `package.json` — root `package.json` has no `name` and no `version` field).

Homepage / live Storybook: https://ui.crossplatformkorea.com
Repo: https://github.com/crossplatformkorea/cpk-ui

---

## 0. TL;DR for BooKoo

- cpk-ui 0.7.0 is validated against **Expo 54 / RN 0.81.5 / React 19.1.0 / kstyled 0.4.1 / react-native-web 0.21**. BooKoo targets **Expo SDK 57** → this is a real version-skew risk (see §9 Risks).
- Theme = 4 buckets only: `bg`, `role`, `text`, `button`. Full token list in §4. Light + dark are both fully defined; `CpkProvider` follows OS color scheme (debounced 300 ms) unless `initialThemeType` is passed.
- Responsive/tablet: theme object carries `isPortrait / isMobile / isTablet / isDesktop` booleans (also exposed as `useTheme().media`). Breakpoints in §5.
- **`useTheme` is NOT exported from the package root.** From an app you use `useCPK()` (which spreads the whole `ThemeContext`, so `const {theme, themeType, media, changeThemeType} = useCPK()`), or deep-import `cpk-ui/providers/ThemeProvider`.
- **`light` / `dark` color objects and the theme types (`CpkTheme`, `CpkThemeParams`, `ThemeParam`) are also NOT exported from root** — `src/utils/index.ts` only re-exports `platform` + `accessibility`. Deep import `cpk-ui/utils/colors` / `cpk-ui/utils/theme` if needed.
- There is **no Calendar / DatePicker / List / BottomSheet / Modal-sheet / Avatar / Badge / Chip / Tabs** component today. Calendar must be built.
- Adding a component = **exactly 4 files touched** (see the two real precedents in §7): `Foo.tsx`, `Foo.stories.tsx`, `Foo.test.tsx` in `src/components/uis/Foo/`, plus one line in `src/index.tsx`. Two automated gates (`components:check`, `storybook:check`) enforce test + story colocation and story *quality*.
- Local iteration from BooKoo: build `lib/` and link it (§8). `lib/` is a fully separate package dir (its own `package.json`, gitignored except that manifest).

---

## 1. Full export surface — `src/index.tsx`

Verbatim (`/Users/hyo/Github/crossplatformkorea/cpk-ui/src/index.tsx`):

```tsx
// Modals
export * from './components/modals/AlertDialog/AlertDialog';
export * from './components/modals/Snackbar/Snackbar';

// Common Components
export * from './components/common/ErrorBoundary/ErrorBoundary';

// Providers
export * from './providers';

// UIs
export * from './components/uis/Accordion/Accordion';
export * from './components/uis/Button/Button';
export * from './components/uis/Card/Card';
export * from './components/uis/Checkbox/Checkbox';
export * from './components/uis/CustomPressable/CustomPressable';
export * from './components/uis/EditText/EditText';
export * from './components/uis/Fab/Fab';
export * from './components/uis/Hr/Hr';
export * from './components/uis/Icon/Icon';
export * from './components/uis/IconButton/IconButton';
export * from './components/uis/LoadingIndicator/LoadingIndicator';
export * from './components/uis/PinchZoom/PinchZoom';
export * from './components/uis/Rating/Rating';
export * from './components/uis/RadioGroup/RadioGroup';
export * from './components/uis/SegmentedControl/SegmentedControl';
export * from './components/uis/StatusbarBrightness/StatusBarBrightness';
export * from './components/uis/SwitchToggle/SwitchToggle';
export * from './components/uis/Typography/Typography';

// Hooks
export * from './hooks';

// Utils
export * from './utils';

// Types
export * from './types';
```

Note the directory is spelled `StatusbarBrightness` (lowercase `b`) while the files inside are `StatusBarBrightness.*` (capital `B`). Keep that quirk in mind when globbing.

### Concrete named exports reachable from `import {...} from 'cpk-ui'`

| Symbol | Kind | From |
|---|---|---|
| `AlertDialogSizeType`, `AlertDialogProps`, `AlertDialogStyles`, `AlertDialogOptions`, `AlertDialogContext` | types | modals/AlertDialog |
| `SnackbarSizeType`, `SnackbarProps`, `SnackbarStyles`, `SnackbarOptions`, `SnackbarContext` | types | modals/Snackbar |
| `ErrorBoundary` | class component | common/ErrorBoundary |
| `CpkProvider`, `useCPK`, `CpkContext`, `CpkProviderProps`, `ThemeType`, `DoobooTheme` | provider + hook + types | providers/index |
| `Accordion`, `AccordionProps`, `AccordionBaseProps`, `AccordionSizeType` | component + types | uis/Accordion |
| `Button`, `Props` (⚠️ Button's props type is exported under the generic name **`Props`**), `ButtonType`, `ButtonColorType`, `ButtonSizeType` | component + types | uis/Button |
| `Card`, `CardProps` | component + type | uis/Card |
| `Checkbox`, `CheckboxProps`, `CheckboxColor`, `CheckboxSizeType` | component + types | uis/Checkbox |
| `CustomPressable` | component | uis/CustomPressable |
| `EditText`, `EditTextProps`, `EditTextStyles`, `EditTextSizeType`, `EditTextStatus` | component + types | uis/EditText |
| `Fab`, `FabProps` | component + type | uis/Fab |
| `Hr` | styled component | uis/Hr |
| `Icon`, `IconProps`, `IconName`, `IconNames`, `IconSizeType`, `iconList` | component + types + const | uis/Icon |
| `IconButton`, `IconButtonProps` | component + type | uis/IconButton |
| `LoadingIndicator`, `LoadingIndicatorProps`, `LoadingIndicatorSizeType` | component + types | uis/LoadingIndicator |
| `PinchZoom`, `PinchZoomProps`, `PinchZoomRef` | component + types | uis/PinchZoom |
| `Rating`, `RatingProps`, `RatingSizeType` | component + types | uis/Rating |
| `RadioGroup`, `RadioButton`, `RadioButtonType` | components + type | uis/RadioGroup |
| `SegmentedControl`, `SegmentedControlProps`, `SegmentedControlItem`, `SegmentedControlColorType`, `SegmentedControlSizeType` | component + types | uis/SegmentedControl |
| `StatusBarBrightness`, `StatusBarBrightnessProps` | component + type | uis/StatusbarBrightness |
| `SwitchToggle`, `SwitchToggleSizeType` | component + type (its `Props` type is **not** exported) | uis/SwitchToggle |
| `Typography`, `TypographyInverted`, `setFontFamily`, `getFontFamilies` | objects + fns | uis/Typography |
| `useOptimizedStyles`, `useStyleArray`, `useFadeAnimation`, `useSlideAnimation`, `useRotateAnimation`, `AnimationConfig` | hooks | hooks/index |
| `isWeb`, `isIOS`, `isAndroid`, `safePlatformSelect`, `getPlatformValue` | fns | utils/platform |
| `getButtonAccessibilityProps`, `getCheckboxAccessibilityProps`, `getRadioAccessibilityProps`, `getTextInputAccessibilityProps`, `getSwitchAccessibilityProps`, `getExpandableAccessibilityProps` | fns | utils/accessibility |
| `ComponentSize`, `ComponentVariant`, `Position`, `BaseStyles`, `BaseComponentProps`, `PressableComponentProps`, `AnimationOptions`, `AccessibilityProps` | types | types/common |

**NOT exported from root** (deep import required): `useTheme`, `ThemeProvider`, `ThemeContext`, `ThemeProps`, `light`, `dark`, `Colors`, `CpkTheme`, `CpkThemeBase`, `CpkThemeParams`, `ThemeParam`, `getTheme`, `isEmptyObject`, `SnackbarTimer` enum (lives in `components/modals/Snackbar/const`), `RadioButtonProps`, `RadioButtonStyles`, `RadioButtonSizeType`, `AccordionItem`, `AccordionItemDataType`, `useHoverState`, `useDebouncedColorScheme`, `usePerformanceMonitor`, `useRenderTracker`, `cloneElemWithDefaultColors`, `createCtx`, everything in `utils/performanceTest.ts`, everything in `components/uis/Styled/StyledComponents.tsx`.

Deep imports work (`lib/package.json` has **no `exports` map**), e.g.:
```ts
import {useTheme} from 'cpk-ui/providers/ThemeProvider';
import {light, dark} from 'cpk-ui/utils/colors';
import {SnackbarTimer} from 'cpk-ui/components/modals/Snackbar/const';
```

---

## 2. Component catalogue — props (exact) + one-line usage note

### 2.1 `src/components/uis/`

#### Accordion — `src/components/uis/Accordion/Accordion.tsx` (+ `AccordionItem.tsx`)
```ts
type Styles = {
  container?: StyleProp<ViewStyle>;
  titleContainer?: StyleProp<ViewStyle>;
  titleText?: StyleProp<TextStyle>;
  itemContainer?: StyleProp<ViewStyle>;
  itemText?: StyleProp<TextStyle>;
  toggleElement?: StyleProp<ViewStyle>;
};
export type AccordionSizeType = 'small' | 'medium' | 'large' | number;
export type AccordionItemDataType<T, K> = {title: T; items: K[]};   // from AccordionItem.tsx
export type AccordionBaseProps<T = string, K = string> = {
  data: AccordionItemDataType<T, K>[];
  style?: StyleProp<ViewStyle>;
  styles?: Styles;
  size?: AccordionSizeType;
  shouldAnimate?: boolean;
  /** @deprecated Use expandAllOnStart instead */
  collapseOnStart?: boolean;
  expandAllOnStart?: boolean;          // default false
  defaultExpandedIndexes?: number[];   // overrides expandAllOnStart
  animDuration?: number;
  activeOpacity?: number;
  toggleElementPosition?: 'left' | 'right';
  toggleElement?: ReactElement | null;
  renderTitle?: (title: T) => ReactElement;
  renderItem?: (body: K) => ReactElement;
  onPressItem?: (title: T | string, body: K | string) => void;
};
export type AccordionProps<T = string, K = string> = AccordionBaseProps<T, K>;
```
Usage: generic collapsible list of `{title, items[]}` groups; supply `renderTitle`/`renderItem` for custom rows.

#### Button — `src/components/uis/Button/Button.tsx`
```ts
export type ButtonType = 'text' | 'solid' | 'outlined';
export type ButtonColorType = 'primary'|'secondary'|'success'|'danger'|'warning'|'info'|'light';
export type ButtonSizeType = 'small' | 'medium' | 'large' | number;
export type Props = {
  testID?: string;
  type?: ButtonType;              // default 'solid'
  color?: ButtonColorType;        // default 'primary'
  size?: ButtonSizeType;          // default 'medium'
  disabled?: boolean;
  loading?: boolean;
  loadingColor?: string;
  loadingElement?: ReactElement;
  text?: string | ReactElement;
  borderRadius?: number;
  startElement?: ReactElement;
  endElement?: ReactElement;
  style?: StyleProp<Omit<ViewStyle, 'borderRadius' | 'padding'>>;
  styles?: {container?; content?; loading?; text?; disabled?; disabledText?; hovered?};
  onPress?: TouchableHighlightProps['onPress'];
  activeOpacity?: TouchableHighlightProps['activeOpacity'];
  touchableHighlightProps?: Omit<TouchableHighlightProps, 'onPress'|'activeOpacity'|'style'>;
  hitSlop?: null | Insets | number | undefined;
  hapticFeedback?: Haptics.ImpactFeedbackStyle;  // expo-haptics
  accessibilityLabel?: string;
};
```
Padding by size: `small '8px 16px'`, `medium '12px 24px'`, `large '16px 24px'`, numeric `${n*0.6}px ${n*1.2}px`; `type='text'` always `8px`.
Usage: primary action button; `type` picks solid/outlined/text, `color` maps into `theme.button[color]`.

#### Card — `src/components/uis/Card/Card.tsx`
```ts
export type CardProps = {
  testID?: string;              // default 'card-container'
  accessibilityLabel?: string;
  children?: React.ReactNode;
  elevation?: number;           // default 2  → shadowRadius/elevation
  borderRadius?: number;        // default 8
  padding?: number;             // default 16
  margin?: number;              // default 0
  backgroundColor?: string;     // default theme.bg.paper
  style?: StyleProp<ViewStyle>;
  styles?: {container?: StyleProp<ViewStyle>; content?: StyleProp<ViewStyle>};
  onPress?: () => void;
};
```
Usage: elevated surface; becomes pressable when `onPress` given. Shadow color = `theme.text.basic`, opacity 0.1.

#### Checkbox — `src/components/uis/Checkbox/Checkbox.tsx`
```ts
export type CheckboxColor = 'primary'|'secondary'|'success'|'danger'|'warning'|'info';
export type CheckboxSizeType = 'small'|'medium'|'large'|number;
export interface CheckboxProps {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  styles?: {container?; checkbox?; check?: ViewStyle; text?};
  color?: CheckboxColor;
  size?: CheckboxSizeType;
  disabled?: boolean;
  checked?: boolean;            // fully controlled
  text?: string | ReactElement;
  direction?: 'left' | 'right'; // label side
  accessibilityLabel?: string;
}
```
Usage: controlled checkbox with optional inline label element.

#### CustomPressable — `src/components/uis/CustomPressable/CustomPressable.tsx`
```ts
function CustomPressable(props: PressableProps & {style?: StyleProp<ViewStyle>}): ReactElement
```
Defaults: `accessibilityRole='button'`, `hitSlop={top:4,bottom:4,left:6,right:6}`, pressed state paints `background-color: theme.role.underlay`. Memoized.
Usage: theme-aware `Pressable` replacement — the right base for any new tappable cell (e.g. a Calendar day cell).

#### EditText — `src/components/uis/EditText/EditText.tsx`
```ts
export type EditTextStyles = {
  container?; labelContainer?; label?; inputContainer?; input?; error?; counter?;
};
export type EditTextSizeType = 'small'|'medium'|'large'|number;
export type EditTextStatus = 'disabled'|'error'|'focused'|'hovered'|'basic';
type RenderType = (stats: EditTextStatus) => ReactElement;
type CustomRenderType = (({color, status}: {color: string; status: EditTextStatus}) => ReactElement) | null;
export type EditTextProps = {
  testID?; inputRef?: MutableRefObject<TextInput|undefined>|RefObject<TextInput>;
  style?: StyleProp<ViewStyle>; styles?: EditTextStyles; size?: EditTextSizeType;
  startElement?: ReactElement | CustomRenderType;
  endElement?: ReactElement | CustomRenderType;
  required?: boolean;
  label?: string | RenderType;
  error?: string | RenderType;
  direction?: 'row' | 'column';
  decoration?: 'underline' | 'boxed';
  value?; multiline?; onChange?; onChangeText?; placeholder?; placeholderColor?;
  onFocus?; onBlur?; editable?; autoComplete?; autoCapitalize?; secureTextEntry?;
  onSubmitEditing?; numberOfLines?; maxLength?;
  hideCounter?: boolean;
  accessibilityLabel?: string;
  textInputProps?: Omit<TextInputProps, ...>;
  colors?: {basic?; disabled?; error?; focused?; hovered?; placeholder?: string};
};
// exported as React.forwardRef<TextInput, EditTextProps>
```
Usage: full form field (label + input + error + character counter); `decoration` picks underline vs boxed.

#### Fab — `src/components/uis/Fab/Fab.tsx`
```ts
export type FabProps = {
  isActive?: boolean;
  icons?: IconName[];
  animationDuration?: number;
  onPressFab: () => void;                    // required
  onPressItem?: (item?: IconName) => void;
  buttonSize?: ButtonSizeType | number;
  fabIcon?: IconName;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  styles?: {Fab?: StyleProp<ViewStyle>; FabItem?: StyleProp<ViewStyle>};
  iconButtonProps?: Omit<React.ComponentProps<typeof IconButton>, 'icon'|'onPress'|'size'>;
};
// exported as: export {FloatingActionButtons as Fab}
```
Usage: expanding floating action button with a fan of `IconName` children.

#### Hr — `src/components/uis/Hr/Hr.tsx`
```ts
export const Hr: React.MemoExoticComponent<StyledComponent<typeof View, {}, {}>>
```
`height: 0.5px; width: 100%; background-color: theme.role.border`. Takes any `View` props/style.
Usage: 1-line divider.

#### Icon — `src/components/uis/Icon/Icon.tsx` (see §6 for the font details)
```ts
export const iconList = ['AddressBook', 'Airplane', ... ] as const;  // 3772 entries
export type IconNames = typeof iconList;
export type IconName = IconNames[number];
export type IconSizeType = 'small' | 'medium' | 'large' | number;
export type IconProps = {
  name: IconName;
  size?: IconSizeType;   // small=18, medium=24 (default), large=32, or raw number
  color?: string;        // defaults to theme.text.basic
  style?: StyleProp<ViewStyle>;
};
export const Icon: FC<IconProps>;
export default Icon;
```
Usage: `<Icon name="CalendarBlank" size="large" />`.

#### IconButton — `src/components/uis/IconButton/IconButton.tsx`
```ts
export type IconButtonProps = {
  testID?: string;
  type?: 'text' | 'solid' | 'outlined';
  color?: 'primary'|'secondary'|'success'|'danger'|'warning'|'info'|'light';
  size?: 'small'|'medium'|'large'|number;
  disabled?: boolean;
  loading?: boolean;
  loadingElement?: ReactElement;
  icon?: IconName;
  iconElement?: ReactElement;
  style?: StyleProp<Omit<ViewStyle, 'borderRadius'|'padding'>>;
  styles?: {container?; icon?; disabled?; hovered?};
  onPress?: TouchableHighlightProps['onPress'];
  activeOpacity?: number;
  touchableHighlightProps?: Omit<TouchableHighlightProps, 'onPress'|'style'>;
  hapticFeedback?: Haptics.ImpactFeedbackStyle;
  accessibilityLabel?: string;
};
```
Note: `ButtonType`/`ButtonColorType`/`ButtonSizeType` are re-declared locally in this file (not imported), so they are structurally but not nominally the Button ones.
Usage: square icon-only button; used internally by `Fab`.

#### LoadingIndicator — `src/components/uis/LoadingIndicator/LoadingIndicator.tsx`
```ts
export type LoadingIndicatorSizeType = 'small'|'medium'|'large'|number;
export interface LoadingIndicatorProps extends BaseComponentProps { // testID/style/disabled
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  styles?: {activityIndicator?: ViewStyle; image?: ImageStyle};
  color?: string;
  size?: LoadingIndicatorSizeType;
  imgSource?: string | ImageSourcePropType;
  customElement?: ReactElement | (() => ReactElement);
}
```
Usage: spinner; swap in a brand image via `imgSource` or arbitrary `customElement`. Story file is misspelled `LodingIndicator.stories.tsx` (the coverage script only pattern-matches `*.stories.tsx`, so it passes).

#### PinchZoom — `src/components/uis/PinchZoom/PinchZoom.tsx`
```ts
export type PinchZoomProps = PropsWithChildren<{
  style?: ViewStyle;              // passing `transform` disables pinch-zoom
  children?: any;
  onScaleChanged?(value: number): void;
  onTranslateChanged?(valueXY: {x: number; y: number}): void;
  onRelease?(): void;
  allowEmpty?: {x?: boolean; y?: boolean};
  fixOverflowAfterRelease?: boolean;   // default true
  testID?: string;
}>;
export interface PinchZoomRef {
  animatedValue: {scale: Animated.Value; translate: Animated.ValueXY};
  setValues(_: {scale?: number; translate?: {x: number; y: number}}): void;
}
// exported as: export {PinchZoomRoot as PinchZoom}  (forwardRef)
```
Usage: pinch/pan/decay container for images; imperative control via ref.

#### Rating — `src/components/uis/Rating/Rating.tsx`
```ts
export type RatingSizeType = 'small'|'medium'|'large'|number;
export type RatingProps = {
  testID?: string;
  styles?: {starContainer: StyleProp<ViewStyle>};
  style?: StyleProp<ViewStyle>;
  size?: RatingSizeType;
  iconType?: 'star' | 'dooboo';
  initialRating?: number;
  direction?: 'horizontal' | 'vertical';
  allowHalfRating?: boolean;
  onRatingUpdate?: (score: number) => void;
  disabled?: boolean;
  color?: string;
};
```
Usage: star rating input/display.

#### RadioGroup / RadioButton — `src/components/uis/RadioGroup/RadioGroup.tsx`, `RadioButton.tsx`
```ts
export type RadioButtonType = 'primary'|'secondary'|'success'|'danger'|'warning'|'info'|'light';
type Props<T> = {
  title?: string;
  data: T[];
  selectedValue: T;
  selectValue?: (item: T) => void;
  type?: RadioButtonType;
  size?: RadioButtonSizeType;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  styles?: {container?; title?; radio?; radioStyles?: RadioButtonStyles};
  labels?: string[];
  radioType?: Omit<RadioButtonProps, 'type'|'size'|'disabled'>;
  labelPosition?: 'left' | 'right';
};
export const RadioGroup: typeof RadioGroupContainer;
export const RadioButton: typeof RadioButtonComp;   // memoized single radio

// RadioButton.tsx
export type RadioButtonSizeType = 'small'|'medium'|'large'|number;
export type RadioButtonStyles = {container?; label?; circleWrapper?; circle?};
export type RadioButtonProps = {
  testID?; onPress?: () => void; label?: string; labelPosition?: 'left'|'right';
  style?; styles?: RadioButtonStyles; type?: RadioButtonType; size?: RadioButtonSizeType;
  disabled?: boolean; selected?: boolean; endElement?: ReactElement;
  startElement?: ReactElement; accessibilityLabel?: string;
};
```
Usage: generic single-select group over `data: T[]` with parallel `labels: string[]`.

#### SegmentedControl — `src/components/uis/SegmentedControl/SegmentedControl.tsx`
```ts
export type SegmentedControlSizeType = 'small'|'medium'|'large'|number;
export type SegmentedControlColorType = 'primary'|'secondary'|'success'|'danger'|'warning'|'info'|'light';
export type SegmentedControlItem = {value: string | number; text: string | ReactElement};
export type SegmentedControlProps = {
  testID?: string;
  values: SegmentedControlItem[];
  selectedValue: string | number;
  onValueChange?: (value: string | number) => void;
  color?: SegmentedControlColorType;      // default 'primary'
  size?: SegmentedControlSizeType;        // default 'medium'
  disabled?: boolean;                     // default false
  style?: StyleProp<ViewStyle>;
  styles?: {container?; segment?; selectedSegment?; text?; selectedText?};
  borderRadius?: number;                  // default 8
};
export const SegmentedControl = React.memo(SegmentedControlContainer);
export default SegmentedControl;
```
Per-segment `testID` is `segment-${index}`. Usage: iOS-style mode switcher — the natural control for BooKoo's Day/Week/Month calendar mode.

#### StatusBarBrightness — `src/components/uis/StatusbarBrightness/StatusBarBrightness.tsx`
```ts
export type StatusBarBrightnessProps = {type?: StatusBarStyle};
```
Auto-resolves to `dark-content` in light theme / `light-content` in dark theme. Usage: drop once per screen root.

#### SwitchToggle — `src/components/uis/SwitchToggle/SwitchToggle.tsx`
```ts
export type SwitchToggleSizeType = 'small'|'medium'|'large'|number;
type Props = {           // NOT exported
  testID?: string;
  size?: SwitchToggleSizeType;
  isOn: boolean;          // required, controlled
  style?: StyleProp<ViewStyle>;
  styles?: {
    container?: ViewStyle; onElementContainer?; offElementContainer?;
    circle?: ViewStyle; button?;
    circleColorOff?: string; circleColorOn?: string;
    backgroundColorOn?: string; backgroundColorOff?: string;
  };
  duration?: number;
  onElement?: any;
  offElement?: any;
  onPress?: () => void;
  accessibilityLabel?: string;
};
```
Usage: animated on/off switch with custom on/off content.

#### Typography — `src/components/uis/Typography/Typography.tsx`
```ts
export const Typography: {Title, Heading1..Heading5, Body1..Body4}          // color: theme.text.basic
export const TypographyInverted: {Title, Heading1..Heading5, Body1..Body4}  // color: theme.text.contrast
export const setFontFamily: (fontFamilies: {heading?: FontFamilyOptions; body?: FontFamilyOptions}) => void;
export const getFontFamilies: (isHeading: boolean) => FontFamilyOptions;
type FontFamilyOptions = {normal: string; thin?: string; bold?: string};
```
Type scale (fontSize / lineHeight, headings are `bold`):

| Variant | fontSize | lineHeight |
|---|---|---|
| Title | 36 | 50.4 |
| Heading1 | 28 | 39.2 |
| Heading2 | 26 | 36.4 |
| Heading3 | 24 | 33.6 |
| Heading4 | 22 | 30.8 |
| Heading5 | 20 | 28 |
| Body1 | 18 | 25.2 |
| Body2 | 16 | 22.4 |
| Body3 | 14 | 19.6 |
| Body4 | 12 | 16.4 |

Defaults: `{normal: 'Pretendard', thin: 'Pretendard-Thin', bold: 'Pretendard-Bold'}` for both `heading` and `body`. Each component accepts `$fontWeight?: 'normal'|'bold'|'thin'` and a `style` prop; `includeFontPadding: false` is always applied. On Android with a non-Pretendard custom font, `fontWeight` is stripped to avoid double-bolding.
Usage: `<Typography.Body2>…</Typography.Body2>`; call `setFontFamily({body:{normal:'Inter'}})` once at app start to rebrand.

#### `src/components/uis/Styled/StyledComponents.tsx` (internal, not exported from index)
`ButtonWrapper`, `ButtonText`, `CheckboxWrapperOutlined`, `CheckboxWrapper`, `RadioButtonWrapper`, `RadioWrapper`, `ColoredText`, `SnackbarWrapper` — shared kstyled primitives keyed by `$type`/`$disabled`/`$selected` transient props. Also declares `export type ButtonType` and `export type SnackbarType` locally.

### 2.2 `src/components/modals/`

#### AlertDialog — `src/components/modals/AlertDialog/AlertDialog.tsx`
```ts
export type AlertDialogSizeType = 'small'|'medium'|'large'|number;
export type AlertDialogProps = {style?: StyleProp<ViewStyle>};
export type AlertDialogStyles = {container?; titleContainer?; title?; bodyContainer?; body?; actionContainer?};
export type AlertDialogOptions = {
  styles?: AlertDialogStyles;
  title?: string | ReactElement;
  body?: string | ReactElement;
  backdropOpacity?: number;
  closeOnTouchOutside?: boolean;
  actions?: ReactElement[];
  showCloseButton?: boolean;
  size?: AlertDialogSizeType;
};
export type AlertDialogContext = {open(o?: AlertDialogOptions): void; close(): void};
export default React.NamedExoticComponent<AlertDialogProps & React.RefAttributes<AlertDialogContext>>
```
Usage: **do not mount it yourself** — `CpkProvider` already renders one; call `useCPK().alertDialog.open({...})`.

#### Snackbar — `src/components/modals/Snackbar/Snackbar.tsx` + `const.ts`
```ts
export enum SnackbarTimer {SHORT = 2000, LONG = 3500}     // const.ts
export type SnackbarSizeType = 'small'|'medium'|'large'|number;
export type SnackbarProps = {style?: StyleProp<ViewStyle>};
export type SnackbarStyles = {container?; text?; actionContainer?; actionText?};
export type SnackbarOptions = {
  color?: ButtonColorType;
  styles?: SnackbarStyles;
  text?: string;
  actionText?: string;
  timer?: SnackbarTimer | number;
  size?: SnackbarSizeType;
};
export type SnackbarContext = {open(o?: SnackbarOptions): void; close(): void};
```
Usage: `useCPK().snackbar.open({text: '저장되었습니다', timer: 2000})`. Also mounted by `CpkProvider`.

### 2.3 `src/components/common/`

#### ErrorBoundary — `src/components/common/ErrorBoundary/ErrorBoundary.tsx`
```ts
interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  style?: StyleProp<ViewStyle>;
}
interface State {hasError: boolean; error?: Error}
export class ErrorBoundary extends Component<Props, State>
```
Default fallback is hardcoded, **not theme-aware** (`backgroundColor '#f8f9fa'`, title `#dc3545`, message `#6c757d`) — BooKoo should pass its own `fallback` for dark mode.

---

## 3. Providers — `src/providers/`

Two files: `src/providers/index.tsx` (CpkProvider + useCPK) and `src/providers/ThemeProvider.tsx` (ThemeProvider + useTheme).

### `CpkProvider` (`CpkWithThemeProvider`)
```tsx
export type CpkProviderProps = {
  themeConfig?: Omit<ThemeProps, 'children'>;   // {initialThemeType?, customTheme?, responsiveDesignMode?}
  snackbarConfig?: SnackbarOptions;             // ⚠️ accepted but currently unused in the implementation
  children: ReactElement;
};
```
Composition: `ThemeProvider` → `SafeAreaProvider` (react-native-safe-area-context) → `AppProvider`.

`AppProvider` responsibilities:
1. `useFonts({cpk: cpk.ttf, 'Pretendard-Bold', Pretendard, 'Pretendard-Thin'})` via `expo-font`.
2. Renders a full-screen `LoadingIndicator` (background `theme.bg.basic`) while `!assetLoaded`, then children.
3. Mounts `<Snackbar ref={snackbar} />` and `<AlertDialog ref={alertDialog} />` after children.
4. Wraps everything in a `<View style={{flex: 1}}>`.

### `useCPK()` returns `CpkContext`
```ts
export type CpkContext = {
  assetLoaded: boolean;
  snackbar: SnackbarContext;       // {open(opts?), close()}
  alertDialog: AlertDialogContext; // {open(opts?), close()}
} & ThemeContext;                  // themeType, media, theme, changeThemeType
```
Throws `Error('useTheme must be inside a ThemeProvider')` if used outside the provider (message comes from the shared `createCtx` helper).

### `ThemeProvider` props (`ThemeProps`)
```ts
export type ThemeType = 'light' | 'dark';
export type ThemeProps = {
  children?: ReactElement;
  initialThemeType?: ThemeType;
  customTheme?: ThemeParam;                            // {light?: Partial<...>, dark?: Partial<...>}
  responsiveDesignMode?: 'mobile-first' | 'desktop-first';  // default 'mobile-first'
};
export type ThemeContext = {
  themeType: ColorSchemeName;                          // 'light'|'dark'|null|undefined
  media: {isPortrait: boolean; isMobile: boolean; isTablet: boolean; isDesktop: boolean};
  theme: DefaultTheme & CpkTheme;
  changeThemeType: (themeType?: ColorSchemeName) => void;  // no arg = toggle
};
```
Behavior notes:
- `themeType` initial value = `initialThemeType ?? useDebouncedColorScheme()`; a `useEffect` keeps re-syncing to the OS color scheme whenever `initialThemeType` is falsy. **Consequence: if you rely on `changeThemeType` for a manual toggle while `initialThemeType` is undefined, an OS scheme change will overwrite the user's choice.** For BooKoo's explicit light/dark/system setting, drive `initialThemeType` from your own persisted store.
- `genTheme(type, themeParam)` deep-merges `customTheme` per bucket; `button` is merged per color key (`primary`, `secondary`, `success`, `warning`, `danger`, `info`, `light`, `disabled`), so partial overrides like `{light: {button: {primary: {bg: '#111'}}}}` keep `text`.
- The final theme object passed to kstyled's `ThemeProvider` is `{...baseTheme, ...media}` — i.e. `isPortrait/isMobile/isTablet/isDesktop` are readable inside any `styled`/`css` template via `({theme}) => theme.isTablet`.

### Module augmentation the consumer must ship
`styled.d.ts` (repo root) and `src/types/kstyled.d.ts`:
```ts
import type {CpkTheme} from './src/utils/theme';
declare module 'kstyled' {
  export interface DefaultTheme extends CpkTheme {}
}
```
BooKoo needs an equivalent `.d.ts` pointing at `cpk-ui/utils/theme` so `theme.*` is typed inside its own kstyled templates.

---

## 4. Theme tokens — every value, light + dark

Defined in `src/utils/colors.ts`; typed in `src/utils/theme.ts`.

```ts
// src/utils/theme.ts
export type CpkThemeBase = Colors & {
  isPortrait?: boolean;
  isDesktop?: boolean;
  isTablet?: boolean;
  isMobile?: boolean;
};
export interface CpkTheme extends CpkThemeBase {}   // empty iface for module augmentation
type RecursivePartial<T> = {[P in keyof T]?: RecursivePartial<T[P]>};
export type CpkThemeParams = RecursivePartial<CpkThemeBase>;
export type ThemeObjParams = {
  bg: Partial<Colors['bg']>;
  role: Partial<Colors['role']>;
  text: Partial<Colors['text']>;
  button: Partial<Colors['button']>;
};
export interface ThemeParam {light?: Partial<ThemeObjParams & any>; dark?: Partial<ThemeObjParams & any>}
export const isEmptyObject = (param: any): boolean => ...
export const getTheme = (theme?: CpkTheme): CpkThemeBase => ...   // falls back to `light`
```

`Colors` = `typeof light`, produced by `createTheme('light'|'dark')`. **There are exactly 4 buckets and 33 leaf tokens.**

### `theme.bg`
| token | light | dark |
|---|---|---|
| `bg.basic` | `#FFFFFF` | `#242424` |
| `bg.paper` | `#EDEDED` | `#1E1D1D` |
| `bg.disabled` | `#BEBEBE` | `#474747` |

### `theme.role`
| token | light | dark |
|---|---|---|
| `role.primary` | `#1B1B1B` | `#FFFFFF` |
| `role.secondary` | `#3D8BFF` | `#3D8BFF` |
| `role.success` | `#1CD66C` | `#2FFA86` |
| `role.warning` | `#E2B101` | `#F4CC3E` |
| `role.danger` | `#F84444` | `#FF3C3C` |
| `role.info` | `#307EF1` | `#2998FF` |
| `role.accent` | `#6BF3C5` | `#4AE3AD` |
| `role.link` | `#A351F4` | `#A351F4` |
| `role.border` | `#CCCCCC` | `#363636` |
| `role.underlay` | `rgba(0, 0, 0, 0.16)` | `rgba(255, 255, 255, 0.16)` |
| `role.underlayContrast` | `rgba(0, 0, 0, 0.8)` | `rgba(255, 255, 255, 0.8)` |

### `theme.text`
| token | light | dark |
|---|---|---|
| `text.basic` | `#000000` | `#FFFFFF` |
| `text.label` | `#4D4D4D` | `#BEBEBE` |
| `text.placeholder` | `#787878` | `#909090` |
| `text.disabled` | `#BEBEBE` | `#6D6D6D` |
| `text.validation` | `#DA0000` | `#FF2C2C` |
| `text.contrast` | `#FFFFFF` | `#000000` |

### `theme.button.<color>.{bg,text}`
| color | light bg | light text | dark bg | dark text |
|---|---|---|---|---|
| `primary` | `#1B1B1B` | `#FFFFFF` | `#FFFFFF` | `#000000` |
| `secondary` | `#3D8BFF` | `#FFFFFF` | `#3D8BFF` | `#000000` |
| `success` | `#1CD66C` | `#FFFFFF` | `#2FFA86` | `#000000` |
| `danger` | `#F84444` | `#FFFFFF` | `#FF3C3C` | `#000000` |
| `warning` | `#E2B101` | `#FFFFFF` | `#F4CC3E` | `#000000` |
| `info` | `#307EF1` | `#FFFFFF` | `#2998FF` | `#000000` |
| `light` | `#E8E8E8` | `#232323` | `#313131` | `#FFFFFF` |
| `disabled` | `#EDEDED` | `#BEBEBE` | `#292929` | `#474747` |

Internal `baseColors` constants (shared into `role`): `success #1CD66C`, `warning #E2B101`, `danger #F84444`, `info #307EF1`, `accent #6BF3C5`, `link #A351F4`.

**Gaps for BooKoo:** there is no `role.surfaceVariant`, no elevation ramp, no spacing scale, no radius scale, and no semantic income/expense color. BooKoo's income(+)/expense(−) colors should ride on `role.info`/`role.danger` or be added through `customTheme` (`ThemeParam` allows arbitrary extra keys via `Partial<ThemeObjParams & any>`, and `CpkTheme` is an augmentable empty interface — so BooKoo can `declare module` extra tokens).

---

## 5. Hooks — `src/hooks/`

`src/hooks/index.ts` re-exports **only** `useOptimizedStyles` and `useAnimations`. The rest are internal.

| Hook | File | Signature | Exported from package root? |
|---|---|---|---|
| `useOptimizedStyles<T>(styleFactory: () => T, deps: DependencyList): T` | `useOptimizedStyles.ts` | thin `useMemo` wrapper | ✅ |
| `useStyleArray<T>(styles: T[], deps): T[]` | `useOptimizedStyles.ts` | memoized array | ✅ |
| `useFadeAnimation(isVisible: boolean, config?: AnimationConfig): Animated.Value` | `useAnimations.ts` | default duration 200, `Easing.ease`, native driver true | ✅ |
| `useSlideAnimation(isVisible, config & {direction?: 'up'|'down'|'left'|'right'})` | `useAnimations.ts` | — | ✅ |
| `useRotateAnimation(isActive, config & {rotationDegrees?: number})` | `useAnimations.ts` | — | ✅ |
| `AnimationConfig = {duration?; easing?; useNativeDriver?}` | `useAnimations.ts` | type | ✅ |
| `useDebouncedColorScheme(delay = 300)` | `useDebouncedColorScheme.tsx` | debounces `useColorScheme()` to stop background→foreground flicker | ❌ internal |
| `useHoverState()` → `{hovered, hoverProps}` | `useHoverState.ts` | `hoverProps` only populated on `Platform.OS === 'web'` (`onPointerEnter/Leave`) | ❌ internal |
| `usePerformanceMonitor(componentName, enabled = __DEV__)` | `usePerformance.ts` | warns on renders > 16 ms | ❌ internal |
| `useRenderTracker(componentName, props, enabled = __DEV__)` | `usePerformance.ts` | warns on prop-identical re-renders | ❌ internal |
| `useTheme()` | `providers/ThemeProvider.tsx` | returns `ThemeContext` | ❌ (use `useCPK()` or deep import) |

**There is no `useDualColor` in 0.7.0** (grep over `src/`, `lib/`, `docs/` returns zero hits) — it existed in the older `dooboo-ui` lineage but not here. Media-query hooks are not exposed either; responsive state comes from `useCPK().media` / `theme.isTablet`.

### Responsive breakpoints (from `ThemeProvider.tsx`, via `react-responsive` + `@expo/match-media`)
| flag | mobile-first (default) | desktop-first |
|---|---|---|
| `isPortrait` | `{orientation: 'portrait'}` | same |
| `isMobile` | `{minWidth: 0}` (always true) | `{minWidth: 0, maxWidth: 767}` |
| `isTablet` | `{minWidth: 767}` | `{minWidth: 768, maxWidth: 992}` |
| `isDesktop` | `{minWidth: 992}` | `{minWidth: 0}` (always true) |

⚠️ In the default `mobile-first` mode the flags are **cumulative, not exclusive**: on a 1024 px tablet all three of `isMobile`, `isTablet`, `isDesktop` are true. BooKoo's tablet layout logic must test in order (`isDesktop` first, then `isTablet`, else phone) or use `responsiveDesignMode="desktop-first"` for mutually exclusive flags.

---

## 6. Utils, types, and the Icon font

### `src/utils/`
| File | Exports | Public? |
|---|---|---|
| `platform.ts` | `isWeb()`, `isIOS()`, `isAndroid()`, `safePlatformSelect<T>(options)`, `getPlatformValue<T>(webValue, nativeValue, fallback)` — all try/catch-guarded so they don't blow up when `Platform.OS` is undefined in tests | ✅ |
| `accessibility.ts` | `getButtonAccessibilityProps(label, disabled?, pressed?)`, `getCheckboxAccessibilityProps(label, checked, disabled?)`, `getRadioAccessibilityProps(label, selected, disabled?)`, `getTextInputAccessibilityProps(label, placeholder?, required?, invalid?)`, `getSwitchAccessibilityProps(label, value, disabled?)`, `getExpandableAccessibilityProps(label, expanded)` | ✅ |
| `theme.ts` | `CpkThemeBase`, `CpkTheme`, `CpkThemeParams`, `ThemeObjParams`, `ThemeParam`, `isEmptyObject`, `getTheme` | ❌ |
| `colors.ts` | `light`, `dark`, `Colors` | ❌ |
| `createCtx.tsx` | default export `createCtx<A>(): [useCtx, Provider]` | ❌ |
| `guards.ts` | `cloneElemWithDefaultColors({element, color, backgroundColor, style})` — clones a child and applies text vs view colors based on element type (`Text`/`TextInput`/`Icon` → TextStyle, `View`/`Image`/`Pressable`/`Touchable*`/`Button` → ViewStyle) | ❌ |
| `performanceTest.ts` | `usePerformanceTest`, `useStylePerformanceTest`, `useRenderTracker`, `useMemoryTracker`, `withPerformanceTest`, `PerformanceMetrics` | ❌ |

**There is no `setFontFamily` in `utils/`** — it lives in `src/components/uis/Typography/Typography.tsx` (see §2.1) and IS publicly exported.

### `src/types/`
- `common.ts` → `ComponentSize = 'small'|'medium'|'large'`, `ComponentVariant = 'primary'|'secondary'|'success'|'danger'|'warning'|'info'|'light'|'dark'`, `Position = 'left'|'right'|'top'|'bottom'|'center'`, `BaseStyles {container?, content?, text?}`, `BaseComponentProps {testID?, style?, disabled?}`, `PressableComponentProps extends BaseComponentProps {onPress?, activeOpacity?, disabled?}`, `AnimationOptions {duration?, delay?, useNativeDriver?, easing?}`, `AccessibilityProps {accessibilityLabel?, accessibilityHint?, accessibilityRole?, accessibilityState?{disabled?,selected?,checked?,busy?,expanded?}}`.
- `index.ts` → `export * from './common'`.
- `kstyled.d.ts` → augments `kstyled`'s `DefaultTheme` with `CpkThemeBase`.
- ⚠️ `environment.d.ts` declares `import type {IconType} from './src/types'` for `*.svg`, but **`IconType` does not exist in `src/types/`** — a latent dangling type reference (tolerated because `noImplicitAny: false`).

### Icon set
- Font: a **custom IcoMoon-generated icon font `cpk.ttf`** at `src/components/uis/Icon/cpk.ttf` (the glyph shapes are Phosphor Icons — names like `Calendar`, `CalendarBlank`, `CalendarCheck`, `CalendarPlus`, `CalendarRange`, `CalendarX`, plus `…Bold` and `…Fill` weight variants).
- Built with `createIconSet` from `@expo/vector-icons/createIconSet` (`@expo/vector-icons` is a **peer dependency**, not a direct dep).
- **Names are typed from a runtime const array**, not from a JSON file:
  ```ts
  export const iconList = ['AddressBook', 'Airplane', /* … */ 'YoutubeLogoFill'] as const;  // 3772 entries
  export type IconNames = typeof iconList;
  export type IconName = IconNames[number];
  const glyphMap = iconList.reduce<Record<IconName, number>>(
    (map, name, index) => {map[name] = 59648 + index; return map;}, {} as Record<IconName, number>);
  ```
  Codepoints are **positional**: `0xE900 + index`. **Inserting a name in the middle of `iconList` shifts every later glyph** — new icons must be appended in the exact order the font was regenerated.
- `selection.json` (the 6.4 MB IcoMoon source) still lives in the folder but is deliberately **excluded from the npm package** (0.7.0 perf work).
- Also in that folder: `Pretendard-Bold.otf`, `Pretendard-Regular.otf`, `Pretendard-Thin.otf` — loaded by `CpkProvider`.
- `src/react-native.config.cjs` (copied to `lib/react-native.config.cjs` by `postbuild`) declares `{dependency: {assets: ['components/uis/Icon']}}` for RN CLI asset linking.
- Calendar-relevant icon names already available: `Calendar`, `CalendarBlank`, `CalendarCheck`, `CalendarPlus`, `CalendarRange`, `CalendarX`, `CaretLeft`/`CaretRight` family, `Clock`, `Coin`, `Coins`, `CurrencyKrw`, `HandCoins`, `Money`, `Receipt`, `Wallet`, `ChartPie` (+ `Bold`/`Fill` variants of each).

---

## 7. Contribution process — what a new `<Calendar>` MUST ship

### 7.1 The template folder (verbatim listings)

`Accordion` — the multi-file variant:
```
src/components/uis/Accordion/Accordion.tsx           # 109 lines — public component + props types
src/components/uis/Accordion/AccordionItem.tsx       # 382 lines — internal subcomponent (NOT in src/index.tsx)
src/components/uis/Accordion/Accordion.stories.tsx   #  92 lines
src/components/uis/Accordion/Accordion.test.tsx      # 293 lines
```

`SegmentedControl` — the minimal variant, and the exact precedent to copy:
```
src/components/uis/SegmentedControl/SegmentedControl.tsx           # 234 lines
src/components/uis/SegmentedControl/SegmentedControl.stories.tsx   # 269 lines
src/components/uis/SegmentedControl/SegmentedControl.test.tsx      # 293 lines
```
There is **no per-component `index.ts`, no per-component `docs/` folder, and no `__tests__/` directory** anywhere in `src/components`. Tests are colocated `*.test.tsx`. (`jest.config.ts` `testMatch` also accepts `src/**/__tests__/**/*.ts?(x)`, but no component uses it.)

`docs/` at the repo root is release/engineering prose only:
```
docs/PERFORMANCE.md
docs/PERFORMANCE_SUMMARY.md
docs/releases/0.7.0.md
docs/blog/2026-07-11-cpk-ui-0.7.0.md
```
Long-form component docs live in `src/docs/*.mdx` (`Introduction.mdx`, `Release070.mdx`, `Engineering070.mdx`) and `src/docs/Colors.stories.tsx` — optional for a new component.

### 7.2 Real precedents — exact diff shape

`git show --name-status 645dc05` ("feat: segmented control (#10)"):
```
A  src/components/uis/SegmentedControl/SegmentedControl.stories.tsx
A  src/components/uis/SegmentedControl/SegmentedControl.test.tsx
A  src/components/uis/SegmentedControl/SegmentedControl.tsx
M  src/index.tsx
```
`git show --name-status de50830` ("feat: add PinchZoom component (#9)"):
```
A  src/components/uis/PinchZoom/PinchZoom.stories.tsx
A  src/components/uis/PinchZoom/PinchZoom.test.tsx
A  src/components/uis/PinchZoom/PinchZoom.tsx
M  src/index.tsx
```
**Four files. Nothing else** — `.ondevice/storybook.requires.ts` is auto-generated (`require.context` over `src/components`), so native Storybook picks up new stories with no edit.

So for Calendar:
```
src/components/uis/Calendar/Calendar.tsx
src/components/uis/Calendar/Calendar.stories.tsx
src/components/uis/Calendar/Calendar.test.tsx
src/index.tsx   →  export * from './components/uis/Calendar/Calendar';   (alphabetical, after Button/Card… before Card? — list is alphabetical: Accordion, Button, Calendar, Card, Checkbox, …)
```

### 7.3 The automated gates

`package.json` scripts (verbatim):
```json
"components:check": "node scripts/check-component-coverage.js",
"storybook:check": "node scripts/check-story-coverage.js",
"test:all": "bun run lint && bun run components:check && bun run storybook:check && bun run tsc && bun run test",
"test": "jest --runInBand",
"lint": "eslint .",
"tsc": "tsc",
"check-peer-deps": "node scripts/check-peer-deps.js",
"e2e-smoke": "node scripts/e2e-smoke.js",
"storybook:web": "storybook dev -p 6006",
"storybook:build": "storybook build --docs -o ./doc-build -c ./.storybook",
"storybook": "cross-env EXPO_PUBLIC_STORYBOOK_ENABLED='true' expo start",
"storybook-generate": "sb-rn-get-stories --config-path .ondevice",
"storybook:audit:ios": "node scripts/audit-native-storybook.js --platform ios",
"pack:dry": "bun run build && npm pack --dry-run ./lib"
```

#### `scripts/check-component-coverage.js`
Parses `src/index.tsx` with the TypeScript compiler API, takes every `export ... from './components/...'` module specifier, resolves its **directory**, and fails if that directory contains no file matching `/\.test\.(js|jsx|ts|tsx)$/`. Exit 1 with a list of offending paths.
→ **Calendar needs `Calendar.test.tsx` in the same folder.**

#### `scripts/check-story-coverage.js` — the strict one
For each `./components/...` export in `src/index.tsx`:
1. The directory must contain a `*.stories.(js|jsx|ts|tsx)` file, else **"Public components without a colocated Storybook story"** → exit 1.
2. The story file must declare a **`const meta = {...}`** variable (unwrapping `as`/`satisfies`/parens). Missing → `missing structured meta object`.
3. `meta.title` must be a string literal starting with one of: **`Actions/`, `Display/`, `Feedback/`, `Foundations/`, `Inputs/`, `Media/`, `System/`** → else `invalid or missing navigation title`.
4. `meta.component` must be present → else `missing component metadata`.
5. `meta.decorators` must be present → else `missing theme decorator`.
6. `meta.parameters.docs.description.component` must be present → else `missing component documentation`.
7. `meta.parameters.notes` must be **absent** → else `legacy notes duplicate the docs page`.
8. At least **2 exported story consts** (`export const X: Story = …`) → else `add at least two visual states`.
9. The story source must NOT match `/## Features|\b(A (?:flexible|versatile|powerful))\b/i` → else `replace generic feature-list copy`.

→ For Calendar, `meta.title` should be **`Inputs/Calendar`** (a date picker is an input) or `Display/Calendar` (a month view is display). Pick one; both pass.

#### Other CI steps (`.github/workflows/ci.yml`, runs on PR)
```
bun install --frozen-lockfile
bun run check-peer-deps
bun run components:check
bun run storybook:check
bun run lint
bun run tsc
bun run build
bunx jest --coverage --forceExit --silent --ci     (NODE_OPTIONS=--max-old-space-size=8192)
bun run e2e-smoke
codecov upload
```
Runner: ubuntu-latest, Node 20.x, **Bun 1.3.13** (`packageManager: bun@1.3.13`).

`scripts/e2e-smoke.js` runs 7 tests: peer-dep check → `npx tsc --noEmit` → `bun run build` → export-path resolution (every `from '...'` in `src/index.tsx` must resolve to a real file) → `npx expo export --platform web` metro bundle → built-lib check (`lib/index.js`, `lib/index.d.ts` exist, and **every directory under `src/components/uis/` must have a matching `lib/components/uis/<Name>/`**) → native module compat matrix (`react-test-renderer` version must equal `react` version, etc.).

### 7.4 Story file skeleton that satisfies every gate

Derived from `SegmentedControl.stories.tsx`. Imports come from `.storybook/`:
```tsx
import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';

import {withThemeProvider} from '../../../../.storybook/decorators';
import {
  StoryCanvas, StoryGrid, StoryHeader, StorySection,
  StorySpecimen, StoryStack, StorySurface, StoryText,
} from '../../../../.storybook/story-ui';
import {Calendar, type CalendarProps} from './Calendar';

const meta = {
  title: 'Inputs/Calendar',                  // MUST start with an allowed category
  component: Calendar,                       // MUST exist
  parameters: {
    docs: {
      description: {
        component: 'A month grid for picking a date...',   // MUST exist; no "## Features", no "A flexible/versatile/powerful"
      },
    },
  },
  args: {/* ... */},
  argTypes: {/* control: 'select' | 'radio' | 'boolean' | {type:'number'} + description */},
  decorators: [withThemeProvider],           // MUST exist
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {render: (args) => (<StoryCanvas>…</StoryCanvas>)};
export const Ranges: Story = {args: {}, render: () => (<StoryCanvas>…</StoryCanvas>)};   // ≥2 exported stories
```

`.storybook/story-ui.tsx` helper components (all theme-aware via `useTheme`): `StoryHeader({title, description})`, `StoryCanvas`, `StoryStack`, `StoryRow`, `StoryGrid`, `StorySection({label, description?})`, `StorySpecimen({label, value?})`, `StorySurface`, `StoryText`.

`.storybook/decorators.tsx` → `withThemeProvider(Story, context, customTheme?)` reads `context.args.theme` (native) or `context.globals.theme` (web), wraps in `<CpkProvider themeConfig={{initialThemeType, customTheme}}>` + a max-width-1180 responsive `StoryFrame`.

`.storybook/preview.tsx` global toolbar: `theme` global (`light`/`dark`), viewports `compactMobile 320×568`, `mobile 390×844`, `tablet 768×1024`, `desktop 1440×900`; `a11y: {test: 'error'}` (a11y violations fail); `storySort.order = ['Overview', ['Introduction','Release 0.7.0','Engineering Notes'], 'Foundations', ['Colors','Typography'], 'Actions', 'Inputs', 'Feedback', 'Display', 'Media', 'System']`; `tags: ['autodocs']`.

Web Storybook story globs (`.storybook/main.ts`): `../src/docs/**/*.mdx`, `../src/docs/**/*.stories.@(js|jsx|ts|tsx)`, `../src/components/**/*.stories.@(js|jsx|ts|tsx)`.
Native (`.ondevice/main.ts`): `["../src/components/**/*.stories.?(ts|tsx|js|jsx)"]`.

### 7.5 Test file skeleton

Uses the **root** `test/testUtils.tsx` (not `src/test/testUtils.tsx`):
```tsx
// test/testUtils.tsx
export const createTestProps = (obj?) => ({navigation: {navigate: jest.fn(), goBack: jest.fn()}, ...obj});
export const createComponent = (children: React.JSX.Element, themeType?: ThemeType) =>
  <ThemeProvider initialThemeType={themeType}>{children}</ThemeProvider>;
```
Typical head of a component test:
```tsx
import * as React from 'react';
import {type ReactElement} from 'react';
import {View} from 'react-native';
import type {RenderAPI} from '@testing-library/react-native';
import {fireEvent, render, waitFor} from '@testing-library/react-native';

import {createComponent, createTestProps} from '../../../../test/testUtils';
import {Calendar} from './Calendar';

describe('[Calendar] render', () => {
  it('should render without crashing', async () => {
    const testingLib = render(createComponent(<Calendar … />));
    expect(await waitFor(() => testingLib.toJSON())).toBeTruthy();
  });
});
```
There is also `src/test/testUtils.tsx` exporting `renderWithProviders(ui, {theme, initialTheme})`, `expectAccessibilityProps`, `waitForAnimation`, `pressWithDelay`, `mockPlatform`, `measureRenderTime` — usable but less used by existing tests.

Jest environment (`jest.config.ts`): preset `jest-expo`, `TZ='Asia/Seoul'`, `EXPO_OS='ios'`, `haste.defaultPlatform='ios'`, fake timers enabled in `beforeAll` (see `test/testSetupEnv.ts`), `react-native-reanimated` mocked, `expo-font.useFonts` mocked to `[]`, `expo-haptics.impactAsync` mocked, unhandled rejections `fail()` the test. **`TZ='Asia/Seoul'` matters a lot for a Calendar's date-boundary tests.**

### 7.6 Coding guidelines the reviewer will enforce (CONTRIBUTING.md)

1. **Never expose individual style attributes as props** — `<Button textStyle={…} />` ✅, `<Button textColor={…} />` ❌.
2. All style props go in a single `styles` object; `style` is the parent's style:
   ```tsx
   type Styles = {container?: StyleProp<ViewStyle>; text?: StyleProp<TextStyle>; disabledButton?: …; disabledText?: …; hovered?: …};
   ```
3. Accept **React elements** for flexibility (`startElement`, `endElement`).
4. Keep components compact; expose extensibility through `render*` functions (`renderTitle={(item) => <Title>{item}</Title>}`).
5. Provide default colors for both themes via theme tokens: `` color: ${({theme}) => theme.textContrast}; ``.

Naming: `testID` → kebab-case; components/enums → PascalCase; constants → UPPER_SNAKE_CASE; vars/fns → camelCase; asset files → lower_snake_case.
Commits: Angular Conventional Commits `<type>(<scope>): <subject>`, imperative lowercase subject, no trailing period, e.g. `feat(calendar): add month grid component`. Enforced by `commitlint` + husky.
Style guide reference: https://github.com/hyochan/style-guide

Also note `.claude/commands/commit.md` in that repo says **NEVER add `Co-Authored-By`** to cpk-ui commits.

### 7.7 Implementation conventions observed in every component

From `SegmentedControl.tsx` (the cleanest 0.7.0-era example):
- `import {styled, css} from 'kstyled';`
- `import {useTheme} from '../../../providers/ThemeProvider';` (components use `useTheme`, never `useCPK`)
- Props type exported as `<Name>Props`; size type as `<Name>SizeType = 'small'|'medium'|'large'|number`; color type as `<Name>ColorType` mirroring `ButtonColorType`.
- A pure `calculateStyles({theme, color, size, …, styles})` function returning arrays of `css\`…\`` + user overrides, wrapped in `useMemo`.
- Handlers wrapped in `useCallback`; child lists built in `useMemo`.
- Deterministic per-child `testID`s (`segment-${index}`).
- a11y on every touchable: `accessibilityRole`, `accessibilityState`, `accessibilityLabel`, plus web `aria-pressed` / `aria-disabled`.
- Default export = `React.memo(Container)`, plus a named export:
  ```tsx
  export const SegmentedControl = React.memo(SegmentedControlContainer);
  export default SegmentedControl;
  ```
- ESLint enforces `@typescript-eslint/consistent-type-imports` (`prefer: 'type-imports'`, `fixStyle: 'inline-type-imports'`) — write `import type {StyleProp} from 'react-native'` / `import {type ReactElement} from 'react'`.

### 7.8 PR checklist (from the merged PRs' bodies)

The PR template asks for: Description (with a screen recording/GIF), Test Plan ("Run on storybook"), Related Issues, Tests (name the test file), and a checkbox confirming the Contributor Guide was followed.

---

## 8. Build, publish, and local development against BooKoo

### Build
```json
"prebuild": "find ./lib -mindepth 1 ! -name 'package.json' -exec rm -rf {} +",
"build": "tsc --project tsconfigBuild.json && cpx './src/**/*.{ts,tsx}' ./lib/src/",
"postbuild": "cp ./src/react-native.config.cjs ./lib/react-native.config.cjs && rm -rf ./lib/tsconfig* && cp README.md ./lib/README.md && mkdir -p ./lib/components/uis/Icon && find ./src/components/uis/Icon/ -type f \\( -name '*.otf' -o -name '*.ttf' \\) -exec cp {} ./lib/components/uis/Icon/ \\;"
```
- `tsconfigBuild.json`: `outDir: "lib"`, `declaration: true`, `declarationMap: true`, `module: esnext`, `target: esnext`, `moduleResolution: bundler`, `jsx: react-jsx`; **excludes** `**/__tests__`, `*.test.ts(x)`, `*.stories.ts(x)`, `*.spec.ts(x)`, `*.example.*`; `files: ["environment.d.ts", "styled.d.ts"]`.
- So `lib/` gets compiled JS + `.d.ts` + `.d.ts.map`, plus the raw sources mirrored under `lib/src/` (by `cpx`), plus the four font files re-copied into `lib/components/uis/Icon/` (`selection.json` deliberately not copied).
- `lib/` is gitignored except its manifest: `.gitignore` has `/lib/*` and `!/lib/package.json`.

### `lib/package.json` (the published manifest)
```json
{
  "name": "cpk-ui", "version": "0.7.0",
  "main": "index", "react-native": "index", "module": "index", "source": "index",
  "types": "index.d.ts",
  "files": ["components","hooks","providers","types","utils","index.js","index.d.ts","index.d.ts.map","react-native.config.cjs","README.md"],
  "peerDependencies": {
    "kstyled": "^0.4.1",
    "babel-plugin-kstyled": "^0.4.1",
    "react": ">=16.9",
    "react-native": ">=0.58",
    "react-native-gesture-handler": "*",
    "@expo/vector-icons": "*",
    "expo-haptics": "*"
  },
  "peerDependenciesMeta": {"babel-plugin-kstyled": {"optional": false}},
  "dependencies": {"hyochan-welcome": "^1.0.1", "react-native-web-hooks": "^3.0.2", "react-responsive": "^10.0.0"},
  "scripts": {"pack": "npm pack --dry-run", "prepublishOnly": "node ../scripts/assert-ci-publish.js"}
}
```
⚠️ Note `files` does **not** include `src` or `test`, so `lib/src/**` and `lib/test/**` are built but not published. Also note that although the published peer list is short, `CpkProvider` at runtime needs `expo-font`, `react-native-safe-area-context`, `@expo/match-media`, `react-responsive`, `react-native-reanimated` (for some components) and `react-native-svg`. The README's install line is the accurate list:
```bash
npx expo install cpk-ui@0.7.0 kstyled@0.4.1 @expo/vector-icons \
  react-native-gesture-handler react-native-svg expo-screen-orientation \
  @expo/match-media expo-haptics
bun add --dev babel-plugin-kstyled@0.4.1
```

### Consumer babel config (required — kstyled is a compile-time lib)
```js
// babel.config.js
module.exports = {
  presets: ['babel-preset-expo'],
  plugins: [
    ['babel-plugin-kstyled', {strict: true}],
    'react-native-reanimated/plugin',   // kstyled plugin MUST come before reanimated
  ],
};
```

### Publish
Only from GitHub Actions `publish.yml` (`workflow_dispatch`, inputs `tag: beta|latest`, `dry_run: bool`). It runs `bun run test:all && bun run build && bun run e2e-smoke && bun run storybook:build`, reads the version from `lib/package.json`, refuses to publish if the git tag or npm version already exists, requires `refs/heads/main`, installs `npm@11.18.0`, runs `scripts/assert-ci-publish.js` (rejects local publish), `npm pack --dry-run`, then `npm publish --access public --tag <tag> --provenance` from inside `lib/`, then tags `v<version>` and creates a GitHub release.
**→ You cannot publish cpk-ui locally.** Version bumps go in `lib/package.json`.

### Developing BooKoo against a local cpk-ui (before Calendar is published)

Recommended, in order of reliability:

**(A) `bun link` on the built `lib/` (this is what the maintainer does — `.claude/settings.local.json` allowlists `Bash(bun link:*)`)**
```bash
cd /Users/hyo/Github/crossplatformkorea/cpk-ui
bun run build                 # regenerates lib/ ; re-run after every Calendar edit
cd lib && bun link            # registers the package name "cpk-ui" globally
cd /Users/hyo/Github/hyodotdev/BooKoo
bun link cpk-ui
```
Then in BooKoo's `metro.config.js` you must allow the symlink target and dedupe React:
```js
const {getDefaultConfig} = require('expo/metro-config');
const path = require('path');
const config = getDefaultConfig(__dirname);
const cpkLib = path.resolve(__dirname, '../../crossplatformkorea/cpk-ui/lib');
config.watchFolders = [...(config.watchFolders ?? []), cpkLib];
config.resolver.unstable_enableSymlinks = true;
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
// force single copies of react / react-native / kstyled
config.resolver.extraNodeModules = {
  react: path.resolve(__dirname, 'node_modules/react'),
  'react-native': path.resolve(__dirname, 'node_modules/react-native'),
  kstyled: path.resolve(__dirname, 'node_modules/kstyled'),
};
module.exports = config;
```

**(B) file: / link: protocol in BooKoo's package.json** (no global state, survives `bun install`)
```json
"dependencies": {"cpk-ui": "link:../../crossplatformkorea/cpk-ui/lib"}
```
(`file:` copies with npm but symlinks with bun; `link:` always symlinks with bun.) Same metro config caveats apply.

**(C) Source aliasing — fastest inner loop, no `bun run build` between edits.** Point metro directly at cpk-ui `src/`:
```js
config.resolver.extraNodeModules['cpk-ui'] = path.resolve(cpkRoot, 'src');
config.watchFolders.push(path.resolve(cpkRoot, 'src'));
```
Requires BooKoo's babel to also run `babel-plugin-kstyled` over that folder (it will, since the plugin is global) and that BooKoo's tsconfig maps `"cpk-ui": ["../../crossplatformkorea/cpk-ui/src/index.tsx"]`. Best for rapid Calendar iteration; switch to (A)/(B) for pre-release verification.

**(D) `bun pm pack` tarball / `patch-package`** — for a one-shot pinned snapshot: `cd lib && npm pack` → `bun add ./cpk-ui-0.7.0.tgz` in BooKoo. Most faithful to what npm will ship; slowest loop.

Whatever the mechanism: after adding Calendar to cpk-ui, BooKoo can consume it immediately; the eventual real dependency is a published `cpk-ui@0.7.1+` (or a `beta` dist-tag build published from CI).

---

## 9. Risks / gotchas for the BooKoo rewrite

1. **Expo SDK skew.** cpk-ui 0.7.0 pins `expo ~54.0.35`, `react-native 0.81.5`, `react 19.1.0`, `react-native-reanimated ~4.1.1`, `react-native-gesture-handler ~2.28.0`, `react-native-safe-area-context ~5.6.0`, `react-native-svg 15.12.1`. BooKoo targets **Expo SDK 57**. The published peer ranges are permissive (`react >=16.9`, `react-native >=0.58`), so install will succeed, but the library has not been validated on 57. Budget time for a cpk-ui compat bump, and be ready to run `bun run e2e-smoke` there.
2. **kstyled version lock.** `cpk-ui@0.7.0` ↔ `kstyled@0.4.1` ↔ `babel-plugin-kstyled@0.4.1` must match exactly (runtime and Babel plugin). `babel-plugin-kstyled` is a **non-optional** peer dep.
3. **`useTheme` / theme tokens are not root exports.** Plan on `useCPK()` or a thin BooKoo-local `useAppTheme()` wrapper; don't scatter deep imports.
4. **`initialThemeType` vs OS scheme fight.** See §3 — a manual dark-mode toggle needs `initialThemeType` sourced from persisted state, not `changeThemeType`.
5. **Cumulative responsive flags in mobile-first mode.** See §5 — `isMobile` is literally `minWidth: 0`.
6. **Icon glyph map is positional.** Never insert into `iconList`; append only.
7. **No virtualized list primitives.** cpk-ui ships nothing list-like — no `FlatList` wrapper, no `SectionList`, no infinite-scroll helper, no skeleton. BooKoo's "snappy with unbounded data" requirement is entirely on the app side (FlashList / `FlatList` + Convex paginated queries); Calendar should therefore be a *pure presentational* month/week grid that takes already-aggregated per-day totals, not one that fetches.
8. **Dead dependencies.** `@gorhom/bottom-sheet@^5.2.8`, `@react-native-community/datetimepicker@8.4.4`, `@react-native-community/slider@5.0.1`, `expo-linear-gradient`, `expo-screen-orientation`, `@react-native-async-storage/async-storage`, `react-useinterval` are declared in cpk-ui's `dependencies` but have **zero references in `src/`**. They inflate the dev install and could be repurposed (e.g. `datetimepicker` is right there if Calendar wants a native picker fallback) — but relying on them means adding a real peer dep.
9. **`ErrorBoundary`'s default fallback ignores the theme** (hardcoded light colors). Always pass `fallback`.
10. **Storybook a11y is set to `test: 'error'`** — a Calendar grid with unlabeled day cells will fail the a11y addon in `storybook:build`.
11. **Jest runs with `TZ='Asia/Seoul'` and fake timers** — Calendar tests must construct dates explicitly, not rely on the host TZ.
12. **`AlertDialog`/`Snackbar` are singletons owned by `CpkProvider`.** Don't render them; call through `useCPK()`.
13. **CI runs the web metro bundle (`expo export --platform web`) in `e2e-smoke`** — any Calendar code that imports a native-only module without a `.web.tsx` fallback will fail CI.

---

## 10. Quick reference — file paths

| What | Path |
|---|---|
| Public export barrel | `/Users/hyo/Github/crossplatformkorea/cpk-ui/src/index.tsx` |
| Theme tokens | `/Users/hyo/Github/crossplatformkorea/cpk-ui/src/utils/colors.ts` |
| Theme types | `/Users/hyo/Github/crossplatformkorea/cpk-ui/src/utils/theme.ts` |
| Providers | `/Users/hyo/Github/crossplatformkorea/cpk-ui/src/providers/index.tsx`, `.../src/providers/ThemeProvider.tsx` |
| Hooks barrel | `/Users/hyo/Github/crossplatformkorea/cpk-ui/src/hooks/index.ts` |
| Icon (font + names) | `/Users/hyo/Github/crossplatformkorea/cpk-ui/src/components/uis/Icon/Icon.tsx`, `cpk.ttf`, `selection.json` |
| Component template (copy this) | `/Users/hyo/Github/crossplatformkorea/cpk-ui/src/components/uis/SegmentedControl/` |
| Coverage gates | `/Users/hyo/Github/crossplatformkorea/cpk-ui/scripts/check-component-coverage.js`, `.../scripts/check-story-coverage.js` |
| Storybook decorators / story kit | `/Users/hyo/Github/crossplatformkorea/cpk-ui/.storybook/decorators.tsx`, `.../.storybook/story-ui.tsx`, `.../.storybook/preview.tsx`, `.../.storybook/main.ts` |
| Test helpers | `/Users/hyo/Github/crossplatformkorea/cpk-ui/test/testUtils.tsx`, `.../test/testSetup.ts`, `.../test/testSetupEnv.ts`, `.../src/test/testUtils.tsx` |
| Build config | `/Users/hyo/Github/crossplatformkorea/cpk-ui/tsconfigBuild.json`, `.../package.json` (build/prebuild/postbuild), `.../lib/package.json` |
| CI / publish | `/Users/hyo/Github/crossplatformkorea/cpk-ui/.github/workflows/ci.yml`, `.../publish.yml`, `.../scripts/e2e-smoke.js`, `.../scripts/assert-ci-publish.js` |
| Contributor rules | `/Users/hyo/Github/crossplatformkorea/cpk-ui/CONTRIBUTING.md` |
