import type {ReactElement} from 'react';
import {useRef, useState} from 'react';
import {
  Image,
  StatusBar,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {Button, PageIndicator, Typography} from 'cpk-ui';
import Animated, {
  useAnimatedScrollHandler,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';

import {BOOKOO_PALETTE} from '~/theme/bookooPalette';
import {t, type TranslationKey} from '~/utils/i18n';

interface TutorialSlide {
  readonly bodyKey: TranslationKey;
  readonly image: ImageSourcePropType;
  readonly titleKey: TranslationKey;
}

const slides = [
  {
    bodyKey: 'tutorial.slide1.body',
    image: require('../../../assets/tutorial/tutorial1.png'),
    titleKey: 'tutorial.slide1.title',
  },
  {
    bodyKey: 'tutorial.slide2.body',
    image: require('../../../assets/tutorial/tutorial2.png'),
    titleKey: 'tutorial.slide2.title',
  },
  {
    bodyKey: 'tutorial.slide3.body',
    image: require('../../../assets/tutorial/tutorial3.png'),
    titleKey: 'tutorial.slide3.title',
  },
] as const satisfies readonly TutorialSlide[];

export function TutorialScreen({
  onFinished,
}: {
  onFinished: () => void;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const {height: windowHeight, width: windowWidth} = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(windowWidth);
  const [viewportHeight, setViewportHeight] = useState(windowHeight);
  const progress = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const artworkWidth = tutorialArtworkWidthForViewport(viewportWidth);
  const onScroll = useAnimatedScrollHandler((event) => {
    const width = event.layoutMeasurement.width;
    if (width > 0) progress.set(event.contentOffset.x / width);
  });

  const updateViewport = (event: LayoutChangeEvent): void => {
    const {height: nextHeight, width: nextWidth} = event.nativeEvent.layout;
    if (nextWidth > 0 && nextWidth !== viewportWidth) {
      setViewportWidth(nextWidth);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          animated: false,
          x: nextWidth * index,
        });
      });
    }
    if (nextHeight > 0) setViewportHeight(nextHeight);
  };

  const nextLabel =
    index === slides.length - 1 ? t('intro.getStarted') : t('common.next');

  const next = (): void => {
    const nextIndex = nextTutorialIndex(index, slides.length);
    if (nextIndex === null) {
      onFinished();
      return;
    }
    // The settled page owns the CTA. Rapid taps must not finish the tutorial
    // before the last page has actually arrived.
    if (reducedMotion) {
      setIndex(nextIndex);
      progress.set(nextIndex);
    }
    scrollRef.current?.scrollTo({
      animated: !reducedMotion,
      x: viewportWidth * nextIndex,
    });
  };

  const updateIndex = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ): void => {
    const measuredWidth = event.nativeEvent.layoutMeasurement.width;
    if (measuredWidth <= 0) return;
    setIndex(
      Math.max(
        0,
        Math.min(
          slides.length - 1,
          Math.round(event.nativeEvent.contentOffset.x / measuredWidth),
        ),
      ),
    );
  };

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.root}>
      <StatusBar
        backgroundColor={BOOKOO_PALETTE.dusk}
        barStyle="light-content"
        hidden={false}
      />
      <Animated.ScrollView
        bounces={false}
        decelerationRate="fast"
        horizontal
        onLayout={updateViewport}
        onMomentumScrollEnd={updateIndex}
        onScroll={onScroll}
        pagingEnabled
        ref={scrollRef}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        style={styles.pager}
        testID="tutorial-pager"
      >
        {slides.map((slide) => (
          <View
            key={slide.titleKey}
            style={[
              styles.slide,
              {
                height: viewportHeight,
                paddingBottom: TUTORIAL_CONTENT_BOTTOM_PADDING,
                paddingTop: TUTORIAL_CONTENT_TOP_PADDING + insets.top,
                width: viewportWidth,
              },
            ]}
          >
            <Image
              accessibilityIgnoresInvertColors
              resizeMode="contain"
              source={slide.image}
              style={{height: artworkWidth * 0.8, width: artworkWidth}}
            />
            <Typography.Title
              accessibilityRole="header"
              $fontWeight="normal"
              style={styles.title}
            >
              {t(slide.titleKey)}
            </Typography.Title>
            <Typography.Body1 style={styles.body}>
              {t(slide.bodyKey)}
            </Typography.Body1>
          </View>
        ))}
      </Animated.ScrollView>
      <View style={styles.footer} testID="tutorial-footer">
        <PageIndicator
          count={slides.length}
          currentIndex={index}
          progress={progress}
          reducedMotion={reducedMotion}
          styles={INDICATOR_STYLES}
          testID="tutorial-dot-indicator"
        />
        <Button
          accessibilityLabel={nextLabel}
          borderRadius={16}
          onPress={next}
          styles={{
            container: styles.nextButton,
            text: styles.nextText,
          }}
          testID="tutorial-next"
          text={nextLabel}
          type="text"
        />
      </View>
    </SafeAreaView>
  );
}

export const TUTORIAL_CONTENT_TOP_PADDING = 24;
export const TUTORIAL_CONTENT_BOTTOM_PADDING = 72;
export const TUTORIAL_ARTWORK_MIN_WIDTH = 184;
export const TUTORIAL_ARTWORK_MAX_WIDTH = 240;

export function tutorialArtworkWidthForViewport(width: number): number {
  return Math.min(
    TUTORIAL_ARTWORK_MAX_WIDTH,
    Math.max(TUTORIAL_ARTWORK_MIN_WIDTH, Math.round(width * 0.52)),
  );
}

export function nextTutorialIndex(
  currentIndex: number,
  slideCount: number,
): number | null {
  return currentIndex >= slideCount - 1 ? null : currentIndex + 1;
}

const styles = StyleSheet.create({
  body: {
    color: BOOKOO_PALETTE.white,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
    paddingHorizontal: 36,
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 20,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  nextButton: {
    minHeight: 48,
    paddingBottom: 8,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 8,
  },
  nextText: {
    color: BOOKOO_PALETTE.main,
    fontSize: 16,
    fontWeight: 'bold',
    lineHeight: 24,
  },
  pager: {flex: 1},
  root: {backgroundColor: BOOKOO_PALETTE.dusk, flex: 1},
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: BOOKOO_PALETTE.white,
    fontSize: 28,
    lineHeight: 36,
    marginTop: 24,
    textAlign: 'center',
  },
});

const INDICATOR_STYLES = {
  activeDot: {backgroundColor: BOOKOO_PALETTE.white},
  inactiveDot: {
    backgroundColor: BOOKOO_PALETTE.dusk,
    borderColor: BOOKOO_PALETTE.white,
  },
};
