import {
  ApiError,
} from '../../../shared/api/httpClient';

export type RoadEventActionErrorKind =
  | 'duplicate'
  | 'rateLimit'
  | 'generic';

export interface RoadEventActionErrorState {
  kind:
    RoadEventActionErrorKind;

  title: string;

  description: string;

  canRetry: boolean;
}

export const getCreateRoadEventErrorState = (
  error: unknown,
): RoadEventActionErrorState => {
  if (
    error instanceof ApiError &&
    error.status === 409
  ) {
    return {
      kind: 'duplicate',
      title:
        'Похожее событие уже отмечено рядом',
      description:
        'Повторную отметку создавать не нужно — она уже видна другим водителям.',
      canRetry: false,
    };
  }

  if (
    error instanceof ApiError &&
    error.status === 429
  ) {
    return {
      kind: 'rateLimit',
      title:
        'Слишком много отметок',
      description:
        'Подождите немного и попробуйте отправить событие ещё раз.',
      canRetry: true,
    };
  }

  return {
    kind: 'generic',
    title:
      'Не удалось добавить событие',
    description:
      'Проверьте соединение и попробуйте ещё раз. Введённые данные сохранены.',
    canRetry: true,
  };
};

export const getFeedbackErrorState = (
  error: unknown,
): RoadEventActionErrorState => {
  if (
    error instanceof ApiError &&
    error.status === 429
  ) {
    return {
      kind: 'rateLimit',
      title:
        'Слишком много действий',
      description:
        'Попробуйте немного позже.',
      canRetry: true,
    };
  }

  return {
    kind: 'generic',
    title:
      'Не удалось отправить ответ',
    description:
      'Проверьте соединение и попробуйте ещё раз.',
    canRetry: true,
  };
};
