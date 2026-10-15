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
    eyebrow: 'ДОРОЖНАЯ ОБСТАНОВКА',
    title: 'Что происходит рядом',
    body: 'OnMap показывает дорожные события на карте: ДТП, перекрытия, работы, опасности и другие важные изменения.',
    image: require('../../shared/assets/brand/editorial/onmap-onboarding-hero.webp'),
  },
  {
    eyebrow: 'АНОНИМНО',
    title: 'Без регистрации и публичного профиля',
    body: 'Делись дорожными событиями анонимно. Для работы приложения используется технический идентификатор, но имя и публичный профиль не нужны.',
    image: require('../../shared/assets/brand/editorial/onmap-community.webp'),
  },
  {
    eyebrow: 'ДОБАВЛЯЙ СОБЫТИЯ',
    title: 'Ты помогаешь городу быть в курсе',
    body: 'Метки на карте размещают сами участники сообщества. Увидел важное событие — добавь его, укажи место и выбери подходящий тип.',
    image: require('../../shared/assets/brand/editorial/onmap-accuracy.webp'),
  },
  {
    eyebrow: 'ПРОВЕРЯЙ АКТУАЛЬНОСТЬ',
    title: 'Помогай обновлять карту',
    body: 'Подтверждай, если событие ещё актуально. Если дорога свободна или ситуация изменилась — сообщи об этом, чтобы другие видели свежую информацию.',
    image: require('../../shared/assets/brand/editorial/onmap-community.webp'),
  },
  {
    eyebrow: 'ВНИМАНИЕ И БЕЗОПАСНОСТЬ',
    title: 'Сначала дорога',
    body: 'OnMap информирует о дорожной обстановке, но не помогает избегать полиции и проверок или прокладывать путь в обход них. Не пользуйся приложением за рулём: остановись в безопасном месте или попроси пассажира.',
    image: require('../../shared/assets/brand/editorial/onmap-splash-hero.webp'),
  },
  {
    eyebrow: 'ПЕРЕД КАРТОЙ',
    title: 'Место и уведомления',
    body: 'Сначала попросим доступ к геопозиции, затем — к уведомлениям. Если разрешите уведомления, по умолчанию будут включены сообщения о подтверждённых ДПС, новости OnMap и предложения партнёров. Их можно отдельно выключить через колокольчик. Любой доступ можно не давать: карта останется доступной.',
    image: require('../../shared/assets/brand/editorial/onmap-onboarding-hero.webp'),
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
