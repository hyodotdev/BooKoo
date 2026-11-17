/* eslint-env jest */
const {View, Text, Image, Animated} = require('react-native');

const useSharedValue = (init) => {
  let value = init;
  return {
    get value() {
      return value;
    },
    set value(next) {
      value = next;
    },
    get: () => value,
    set: (next) => {
      value = typeof next === 'function' ? next(value) : next;
    },
  };
};
const useAnimatedStyle = (fn) => fn();
const useDerivedValue = (fn) => useSharedValue(fn());
const useAnimatedScrollHandler = () => ({});
const useAnimatedRef = () => ({current: null});
const layoutTransition = {
  duration: jest.fn(() => layoutTransition),
  easing: jest.fn(() => layoutTransition),
  reduceMotion: jest.fn(() => layoutTransition),
};
// One object per animation: jest.config sets resetMocks:false, so a shared
// object merges FadeIn's and FadeOut's call logs and a duration assertion on
// one of them passes when only the other ran.
const makeFadeTransition = () => {
  const transition = {
    duration: jest.fn(() => transition),
    delay: jest.fn(() => transition),
    reduceMotion: jest.fn(() => transition),
  };
  return transition;
};

module.exports = {
  __esModule: true,
  default: {
    createAnimatedComponent: (component) => component,
    View,
    Text,
    Image,
    ScrollView: View,
    FlatList: View,
  },
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useAnimatedScrollHandler,
  useAnimatedRef,
  useAnimatedGestureHandler: jest.fn(),
  // cpk-ui Calendar pages through a reaction on its scroll offset.
  useAnimatedReaction: jest.fn(),
  withTiming: (toValue) => toValue,
  withSpring: (toValue) => toValue,
  withDecay: jest.fn(),
  withDelay: (_, animation) => animation,
  withSequence: (...args) => args[args.length - 1],
  withRepeat: (animation) => animation,
  cancelAnimation: jest.fn(),
  Easing: {
    linear: jest.fn(),
    ease: jest.fn(),
    quad: jest.fn(),
    cubic: jest.fn(),
    poly: jest.fn(),
    sin: jest.fn(),
    circle: jest.fn(),
    exp: jest.fn(),
    elastic: jest.fn(),
    back: jest.fn(),
    bounce: jest.fn(),
    bezier: jest.fn(() => jest.fn()),
    in: jest.fn(),
    out: jest.fn(),
    inOut: jest.fn(),
  },
  Extrapolation: {
    CLAMP: 'clamp',
    EXTEND: 'extend',
    IDENTITY: 'identity',
  },
  interpolate: jest.fn(),
  interpolateColor: jest.fn(),
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  makeMutable: (init) => ({value: init}),
  createAnimatedComponent: (component) => component,
  FadeIn: makeFadeTransition(),
  FadeOut: makeFadeTransition(),
  FadeInDown: {duration: jest.fn(() => ({delay: jest.fn()}))},
  FadeOutUp: {duration: jest.fn(() => ({delay: jest.fn()}))},
  SlideInDown: {duration: jest.fn()},
  SlideOutDown: {duration: jest.fn()},
  Layout: {duration: jest.fn()},
  LinearTransition: layoutTransition,
  ReduceMotion: {System: 0, Always: 1, Never: 2},
  ColorSpace: {RGB: 0, HSV: 1},
  KeyboardState: {UNKNOWN: 0, OPEN: 1, CLOSED: 2},
  InterfaceOrientation: {
    PORTRAIT: 0,
    LANDSCAPE_LEFT: 1,
    LANDSCAPE_RIGHT: 2,
    PORTRAIT_UPSIDE_DOWN: 3,
  },
  IOSReferenceFrame: {AUTO: 0, SCREEN: 1, WINDOW: 2},
  advanceAnimationByFrame: jest.fn(),
  advanceAnimationByTime: jest.fn(),
  getAnimatedStyle: jest.fn(),
  measure: jest.fn(),
  scrollTo: jest.fn(),
  setNativeProps: jest.fn(),
  useScrollViewOffset: jest.fn(() => ({value: 0})),
  useReducedMotion: jest.fn(() => false),
  useFrameCallback: jest.fn(),
  processColor: jest.fn(),
  reanimatedVersion: '4.2.1',
};
