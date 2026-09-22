import React, {useEffect, useMemo, useState} from 'react';

import {
  Image,
  ImageSourcePropType,
  Pressable,
  Text,
  View,
} from 'react-native';

import Animated, {
  Easing,
  FadeInDown,
  useReducedMotion,
} from 'react-native-reanimated';
import {SafeAreaView} from 'react-native-safe-area-context';

import {motion} from '../../shared/theme';
import {OnMapBrand} from '../../shared/ui/OnMapBrand';

import {styles} from './OnboardingScreen.styles';

interface OnboardingScreenProps {
  onComplete: () => Promise<void> | void;
}

interface OnboardingSlide {
  eyebrow: string;
  title: string;
  body: string;
  image: ImageSourcePropType;
}

const SLIDES: readonly OnboardingSlide[] = [
  {
    eyebrow: 'ЖИВОЙ ГОРОД',
    title: 'Больше, чем карта',
    body: 'OnMap собирает дорожные события в одном месте, чтобы ты быстрее понимал, что происходит вокруг.',
    image: require('../../shared/assets/brand/editorial/onmap-onboarding-hero.webp'),
  },
  {
    eyebrow: 'ЗДЕСЬ И СЕЙЧАС',
    title: 'События рядом',
    body: 'ДТП, дорожные работы, перекрытия и опасности — от горожан и проверенных источников.',
    image: require('../../shared/assets/brand/editorial/onmap-community.webp'),
  },
  {
    eyebrow: 'БЕЗ ЛОЖНОЙ ТОЧНОСТИ',
    title: 'Честная точность',
    body: 'Если точное место известно — покажем точку. Если известна только улица или район — покажем приблизительную область и честно скажем об этом.',
    image: require('../../shared/assets/brand/editorial/onmap-accuracy.webp'),
  },
  {
    eyebrow: 'ВМЕСТЕ ТОЧНЕЕ',
    title: 'Карта становится лучше вместе с городом',
    body: 'Добавляй события, подтверждай актуальные и сообщай, когда дорога снова свободна.',
    image: require('../../shared/assets/brand/editorial/onmap-community.webp'),
  },
  {
    eyebrow: 'БЕЗОПАСНОСТЬ',
    title: 'Главное — дорога',
    body: 'Информация в OnMap носит справочный характер. Не отвлекайся на приложение за рулём и ориентируйся на реальную дорожную обстановку.',
    image: require('../../shared/assets/brand/editorial/onmap-splash-hero.webp'),
  },
] as const;

const SlideVisual = ({
  image,
  title,
}: Pick<OnboardingSlide, 'image' | 'title'>) => (
  <View style={styles.visual}>
    <Image
      accessibilityIgnoresInvertColors
      accessibilityLabel={`Иллюстрация: ${title}`}
      resizeMode="cover"
      source={image}
      style={styles.visualImage}
    />
  </View>
);

export const OnboardingScreen = ({onComplete}: OnboardingScreenProps) => {
  const [index, setIndex] = useState(0);
  const [canContinue, setCanContinue] = useState(false);
  const [completing, setCompleting] = useState(false);
  const reducedMotion = useReducedMotion();
  const slide = SLIDES[index];

  useEffect(() => {
    setCanContinue(false);
    const timer = setTimeout(
      () => setCanContinue(true),
      motion.onboardingMinimumVisibleMs,
    );

    return () => clearTimeout(timer);
  }, [index]);

  const progress = useMemo(
    () => SLIDES.map((_, itemIndex) => itemIndex <= index),
    [index],
  );

  const handleContinue = async () => {
    if (!canContinue || completing) {
      return;
    }

    if (index < SLIDES.length - 1) {
      setIndex(current => current + 1);
      return;
    }

    setCompleting(true);
    try {
      await onComplete();
    } finally {
      setCompleting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}>
        <OnMapBrand compact />
        <View accessibilityLabel={`Экран ${index + 1} из ${SLIDES.length}`} style={styles.progress}>
          {progress.map((active, itemIndex) => (
            <View
              key={itemIndex}
              style={[styles.progressSegment, active && styles.progressSegmentActive]}
            />
          ))}
        </View>
      </View>

      <Animated.View
        key={index}
        entering={FadeInDown.duration(
          reducedMotion ? 0 : motion.contentEnterDurationMs,
        ).easing(Easing.out(Easing.cubic))}
        style={styles.content}
      >
        <SlideVisual image={slide.image} title={slide.title} />
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.body}>{slide.body}</Text>
        </View>
      </Animated.View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={index === SLIDES.length - 1 ? 'Открыть карту' : 'Далее'}
        accessibilityState={{disabled: !canContinue || completing}}
        disabled={!canContinue || completing}
        onPress={handleContinue}
        style={({pressed}) => [
          styles.button,
          (!canContinue || completing) && styles.buttonDisabled,
          pressed && canContinue && styles.buttonPressed,
        ]}
      >
        <Text style={styles.buttonText}>
          {index === SLIDES.length - 1 ? 'Открыть карту' : 'Далее'}
        </Text>
        <Text style={styles.buttonArrow}>→</Text>
      </Pressable>
    </SafeAreaView>
  );
};
